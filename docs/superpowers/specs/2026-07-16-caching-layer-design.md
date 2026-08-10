# Caching Layer Design — user-microservice

**Date:** 2026-07-16
**Status:** Approved pending review
**Scope:** Pluggable caching (in-memory / Redis) with versioned-namespace invalidation, Redis-outage resilience, applied module-wise starting with the hottest modules: user, userTenantMapping, rbac/assign-role, cohort, cohortMembers.

## Context

- NestJS 11 + TypeORM (Postgres), deployed as **multiple replicas on Kubernetes** → in-memory caching alone is unsafe for shared data; **Redis is the primary store**, in-memory is the dev/local default.
- **Only this service writes to its database**, so in-process eviction hooks at the service layer are sufficient (no out-of-band writers to worry about). Kafka events already published on User/Cohort/CohortMember/UserTenant mutations mark the exact eviction points.
- Freshness requirement: **immediate** — a successful write must invalidate affected cache entries right away. TTLs exist only as a safety net.
- No caching exists today (only an in-memory Keycloak admin-token cache in `src/common/utils/keycloak.adapter.util.ts`). No interceptors or active middleware conflict with this design.

## Decisions (settled with stakeholder)

| Decision | Choice |
|---|---|
| Stack | `@nestjs/cache-manager` + cache-manager v6 (Keyv stores: in-memory default, `@keyv/redis` in QA/prod) |
| Cache layer | Service layer, decorator-based (`@Cacheable` / `@CacheEvict`) over an explicit `CacheService` |
| Invalidation | **Versioned namespaces** — one `INCR` per write orphans all keys in scope; orphans reclaimed by TTL |
| Redis outage | Never a hard dependency: timeout + treat-as-miss + circuit breaker; requests always fall through to the DB |
| Phasing | Phase 1 = hot per-user/volatile modules (user, userTenantMapping, userRoles, cohort, cohortMembers); Phase 2 = reference data (tenant, forms, fields, locations, roles, privileges, academicyears, rolepermission) |

## 1. Architecture

New global module `src/cache/`:

- `CacheModule` (global) — wires the store from env:
  - `CACHE_ENABLED` (default `false` until rollout) — when false, every cache call is a pass-through (panic/rollback switch, no deploy needed).
  - `CACHE_PROVIDER=memory|redis` (default `memory`).
  - `REDIS_URL` — required when provider is `redis`.
  - `CACHE_DISABLED_NAMESPACES` — comma-separated list to switch off individual namespaces at runtime config level.
- `CacheService` — the only API application code uses. Store choice is invisible to callers; adding another adapter later is config + one provider.

## 2. CacheService API

```ts
// Core primitive
cacheService.fetch<T>(
  {
    namespace: ['cohort', tenantId],          // owning scope (version bumped by writes)
    dependsOn: [['cohortmember', tenantId]],  // extra namespaces whose versions are embedded in the key
    key: ['search', hashOf(normalizedFilters)],
    ttl: 300,                                  // seconds, safety net
  },
  () => this.loadFromDb(...)
): Promise<T>

cacheService.invalidate(['cohort', tenantId]): Promise<void>  // one INCR
```

Decorators built on top, for service methods:

- `@Cacheable({ namespace: (args) => string[], dependsOn?, key: (args) => string[], ttl })`
- `@CacheEvict({ namespaces: (args, result) => string[][] })` — runs **after** the wrapped method resolves successfully, never before or on error.

**Key format:** `ums:{ns}:v{n}[.{n2}...]:{keyParts}` where `v{n}.{n2}` are the versions of the owning namespace and each dependency (fetched in one `MGET`). Version counters live at `ums:v:{ns}` with no TTL; a missing counter is initialized to 1.

**Search-body hashing:** request filter objects are normalized (recursively sorted keys, nulls dropped) then SHA-1 hashed. Pagination/sort fields stay in the hash — each page/sort is its own entry, which is correct.

### Why search APIs are cacheable here

Invalidation never needs to enumerate which filter combinations a write affected — the namespace `INCR` orphans all of them at once. The only open question per search endpoint is hit rate (do clients repeat the same queries?). List screens typically fire identical default queries repeatedly, which is where the observed slowness is. Hit/miss is logged per namespace; any endpoint with a poor hit rate in QA is disabled via `CACHE_DISABLED_NAMESPACES` with no code change.

## 3. Invalidation model — versioned namespaces

- Read: `MGET` version(s) → build key → `GET` → hit? return : run loader, `SET key EX ttl`.
- Write: after DB success, `INCR ums:v:{ns}` for each affected namespace. O(1), atomic, effective across all pods simultaneously (single Redis source of truth).
- Old-version keys are never deleted explicitly; TTL reclaims them.
- Cross-entity dependencies are declared at the read site via `dependsOn` (see per-module tables below), so a write only ever bumps its own namespace(s).
- On the in-memory provider (single pod / dev) the same algorithm runs against the local map — semantics identical.

## 4. Redis-outage resilience

- Every Redis operation wrapped in try/catch **and a ~150 ms timeout**. Any failure ⇒ treated as cache miss ⇒ loader (DB query) runs. Cache errors are logged as warnings, never propagated to the request.
- **Circuit breaker:** after N (default 5) consecutive failures, skip Redis entirely for a cooldown (default 30 s), then probe again. Prevents a dead Redis from adding timeout latency to every request.
- When Redis is unreachable, version counters are unreadable too ⇒ everything is a miss ⇒ correct data straight from DB (never stale). After a Redis flush/restart, missing counters re-initialize ⇒ worst case is a cold cache, never wrong data.
- `@CacheEvict` failure handling: if the `INCR` fails post-write, log at error level; the circuit is likely open so reads are also bypassing cache (going to DB) — combined with the TTL safety net, staleness exposure is bounded. Health endpoint reports Redis status informationally but never fails on it.

## 5. Phase 1 — module-wise caching plan

TTLs are safety nets; correctness comes from eviction. All namespaces implicitly prefixed `ums:`.

### 5.1 user module

| Read | Namespace | dependsOn | TTL | Evicted by |
|---|---|---|---|---|
| `GET /read/:userId` | `user:{tenantId}:{userId}` | — | 15 min | `PATCH /update/:userid`, `DELETE /delete/:userId` (the `USER_UPDATED`/`USER_DELETED` publish points in `user.service.ts`) — also bump `userlist:{tenantId}` |
| `POST /list` | `userlist:{tenantId}` | — | 3 min | user create/update/delete |
| `POST /users-hierarchy-view` | `userlist:{tenantId}` | `cohortmember:{tenantId}` (per tenant in scope) | 3 min | same + membership changes via dependency |
| `POST /hierarchical-search` | `userlist:{tenantId}` | `cohortmember:{tenantId}` | 3 min | same |

Per-record + list split means updating one user evicts that user's read cache and the tenant's list caches — not every other user's record cache.

Not cached: `/check`, `/suggestUsername`, OTP/password/presigned-url flows.

### 5.2 userTenantMapping module

| Read | Namespace | TTL | Evicted by |
|---|---|---|---|
| `GET /user-tenant/:userId` | `usertenant:{userId}` | 10 min | `POST /user-tenant`, `PATCH /user-tenant/status` (the `USER_TENANT_*` publish points) |

### 5.3 rbac/assign-role module (UserRolesMapping)

| Read | Namespace | TTL | Evicted by |
|---|---|---|---|
| `GET /rbac/usersRoles/:userId` | `userroles:{tenantId}:{userId}` | 10 min | `POST /rbac/usersRoles`, `DELETE /rbac/usersRoles/:userId`, `PATCH /rbac/usersRoles/bulkUpdate` (bulk bumps each affected user's namespace) |

Authz hot path — highest expected value per byte cached.

### 5.4 cohort module

| Read | Namespace | dependsOn | TTL | Evicted by |
|---|---|---|---|---|
| `POST /cohort/search` | `cohort:{tenantId}` | — | 5 min | cohort create / update / updateStatus / delete (the `COHORT_*` publish points) |
| `GET /cohort/cohortHierarchy/:cohortId` | `cohort:{tenantId}` | — | 5 min | same |
| `POST /cohort/geographical-hierarchy` | `cohort:{tenantId}` | — | 5 min | same |
| `GET /cohort/mycohorts/:userId` | `cohort:{tenantId}` | `cohortmember:{tenantId}` | 5 min | cohort writes + membership changes via dependency |

`academicyearid` header participates in key parts for academic-year-scoped reads. Hierarchy reads with `customField=true` also reflect Fields data; until Phase 2 adds a `fields` namespace, the 5-min TTL bounds that staleness (Fields changes are rare admin operations).

### 5.5 cohortMembers module

| Read | Namespace | dependsOn | TTL | Evicted by |
|---|---|---|---|---|
| `GET /cohortmember/read/:cohortId` | `cohortmember:{tenantId}` | `userlist:{tenantId}` | 3 min | member create / update / delete / bulkCreate + cron `assign-students` (the `COHORT_MEMBER_*` publish points, incl. `cron.service.ts`) |
| `POST /cohortmember/list` | `cohortmember:{tenantId}` | `userlist:{tenantId}` | 3 min | same |

`dependsOn userlist` because member responses embed user details/custom fields.

## 6. Phase 2 — reference data (later)

Tenants, Forms (+ bump on Fields writes), Fields/formFields/options, Locations, Roles, Privileges-by-role, AcademicYears, RolePermission map — long TTL (~1 h) + direct eviction hooks in their write methods (these modules publish no Kafka events, so hooks are added explicitly). Adding these later also lets cohort hierarchy declare `dependsOn: fields`.

**Never cached (all phases):** auth/OTP/token/SSO/password routes, presigned URLs, existence checks, all writes.

## 7. Observability

- Per-namespace counters: hit, miss, error, circuit-open bypass — logged periodically (liftable to metrics later).
- Debug log on every invalidation (namespace + caller).
- These numbers drive the QA decision of which search namespaces stay enabled.

## 8. Testing

- Unit: `CacheService` on the memory store — hit/miss, TTL expiry, version bump orphaning, `dependsOn` version vectors, filter normalization/hash stability, decorator ordering (evict only after success).
- Resilience: mock store that throws/times out — requests still succeed via loader; circuit opens after N failures and recovers after cooldown.
- Integration (per module): write → subsequent read is a miss and returns fresh data; unrelated namespace remains a hit.

## 9. Rollout

1. Ship `CacheModule` + user module caching behind `CACHE_ENABLED=false`; enable in dev with memory provider, then QA with Redis.
2. Roll remaining Phase 1 modules one by one (userTenantMapping → userRoles → cohort → cohortMembers), watching hit rates and invalidation logs in QA.
3. Disable poor-hit-rate namespaces via `CACHE_DISABLED_NAMESPACES`.
4. Phase 2 reference data after Phase 1 is stable in prod.
