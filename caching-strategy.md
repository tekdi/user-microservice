# Caching / Redis — As-Built Implementation Reference

**user-microservice**, key prefix `ums`. This document describes what is
**actually implemented**, for someone picking up this layer
cold. Every namespace, key, TTL and invalidation hook below was read out of the
source, not from a plan.

---

## 1. How it works

### 1.1 The one rule

All caching goes through **`CacheService`** ([`src/cache/cache.service.ts`](src/cache/cache.service.ts)).
Application code never imports a Redis, Keyv, or `cache-manager` client
directly. There are exactly three public methods:

| Method | Used for |
|---|---|
| `getOrLoad({namespace, key, dependsOn?, ttlSeconds, loader})` | single cached read |
| `bulkGetOrLoad({ids, namespaceFor, dependsOn?, ttlSeconds, loader})` | N-record hydration in 2 round-trips |
| `invalidate(namespace \| namespace[])` | bump version counters after a write |

### 1.2 Versioned namespaces — the only invalidation primitive

Every cached thing lives in a *namespace* that has a version counter. Nothing
is ever `DEL`-ed; invalidation is a single `INCR`.

```
counter:      ums:v:{namespace}                       e.g. ums:v:user:8f3a…  = 12
entry (logical): ums:{namespace}:v{N}:{key}           e.g. ums:user:8f3a…:v12:core:t1
```

**Read path** (`getOrLoad`), in order:

1. `isNamespaceCacheable()` — if `CACHE_ENABLED=false` or the namespace/family
   is in `CACHE_DISABLED_NAMESPACES`, return `loader()` immediately.
2. Circuit-breaker check — if open, record `bypass` and return `loader()`.
3. **`MGET` the version counters** for the namespace *and* every `dependsOn`.
   Missing counter ⇒ treated as `1`.
4. Build the entry key with all versions embedded, then `GET` it.
5. Hit ⇒ record `hit`, return. Miss ⇒ record `miss`, run `loader()`.
6. If the result is cacheable, `SET` it with the TTL.

**Why versions instead of `DEL`** — step 3 happens *before* the loader runs.
If a write commits and `INCR`s mid-read, the read's late `SET` lands under the
now-superseded version and is simply an orphan nobody requests. This is what
makes cache-aside race-safe, and it is why even per-record caches carry a
counter. *(Verified against live Redis — see §5.)*

**Invalidation ordering is the caller's job.** `CacheService` cannot enforce
it. Every `invalidate()` call must sit **after** the DB write has committed and
must not run on a failed write.

### 1.3 No negative caching

`isCacheable()` rejects `null`, `undefined`, `false`, and `[]`. Nothing empty
is ever stored, so a "not found" can never outlive the next create.

Two idioms in the codebase lean on this deliberately:

- **Response caches** wrap their loader as `response.headersSent ? null : result`.
  If the underlying method already wrote an error response, the loader returns
  `null` and nothing is cached — error responses are structurally uncacheable.
- **`getCachedUserCoreRow`** converts `findUserDetails`' `false` return into
  `null`, because the surrounding value is a non-empty array and would
  otherwise look cacheable.

### 1.4 Resilience

Every Redis-touching op funnels through `executeOp()`:

- `CACHE_OP_TIMEOUT_MS` per-op timeout (default 150ms)
- any failure is treated as a **miss** — the loader runs, the request succeeds
- **circuit breaker**: after `CACHE_CB_FAILURES` consecutive failures, Redis is
  skipped entirely for `CACHE_CB_COOLDOWN_MS`, so a dead Redis adds no latency

Redis down ⇒ counters unreadable ⇒ everything reads from the DB. Correct, never
stale. After a Redis flush, counters reinitialize to 1 ⇒ cold cache — **but see
the hazard in §6.1.**

### 1.5 Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CACHE_ENABLED` | `false` | master switch; `false` = every call is pass-through, **including INCRs** |
| `CACHE_PROVIDER` | `memory` | `memory` \| `redis` |
| `REDIS_URL` | — | required when provider is `redis`; if empty it logs an error and **silently falls back to memory** |
| `CACHE_KEY_PREFIX` | `ums` | per-service prefix |
| `CACHE_DISABLED_NAMESPACES` | empty | comma-separated bypass list; matches by family (`userlist`) or exact (`cohort:{uuid}`) |
| `CACHE_OP_TIMEOUT_MS` | `150` | per-op timeout |
| `CACHE_CB_FAILURES` / `CACHE_CB_COOLDOWN_MS` | `5` / `30000` | circuit breaker |
| `CACHE_METRICS_INTERVAL_MS` | `60000` | metrics log cadence |

`memory` is **per-process**: each pod gets its own cache *and its own counters*,
so an INCR on one pod does not invalidate another. It is safe only for
single-process dev.

### 1.6 Observability

- Per-namespace `hit / miss / error / bypass` counters, logged every
  `CACHE_METRICS_INTERVAL_MS` as `cache metrics {...}`. Counters are grouped by
  **family**, so `ufields:{userId}` reports under `ufields`.
- `cache INCR ns=… v=… caller=…` debug line on every invalidation. **A write
  that produces no INCR line is an unhooked write path.**
- `GET /health` reports `cache.redis` (`ok` / `unreachable` / `not-configured` /
  `disabled`) plus `disabledNamespaces` and the counters. It is informational
  and never fails the health check.

---

## 2. Namespace catalog

| Namespace | Width | Holds | TTL |
|---|---|---|---|
| `user:{userId}` | narrow | one user's core row + tenant/role pair | 15 min |
| `ufields:{userId}` | narrow | one user's processed custom fields | 1 h |
| `cfields:{cohortId}` | narrow | one cohort's processed custom fields | 1 h |
| `userlist:{tenantId}` | wide | `POST /user/list` responses | 3 min |
| `userfilter` | wide | custom-field filter → id lists | 5 min |
| `usertenant:{userId}` | narrow | user's tenant mappings | 10 min |
| `userroles:{userId}` | narrow | user's assigned roles | 10 min |
| `cohort:{tenantId}` | wide | cohort search / hierarchy / mycohorts | 5 min |
| `cohortmember:{tenantId}` | wide | member read / list | 3 min |
| `fields:{tenantId}`, `fields:global` | wide | field definitions, formFields, options | 1 h |
| `form:{tenantId}`, `form:global` | wide | form read | 1 h |
| `tenant` | wide | tenant read / search | 1 h |
| `fieldsdef` | global epoch | **holds nothing** — counter only | — |

`fieldsdef` is a pure epoch: no entries are ever written under it. It is
declared as `dependsOn` by every read whose output embeds field definitions, so
one INCR makes all of them stale at once.

TTL constants live next to their consumers: `USER_CORE_TTL_SECONDS`,
`USERLIST_TTL_SECONDS` ([user.service.ts](src/user/user.service.ts)),
`UFIELDS_TTL_SECONDS`, `USERFILTER_TTL_SECONDS`, `FIELDSDEF_TTL_SECONDS`
([fields.service.ts](src/fields/fields.service.ts)), `COHORT_TTL_SECONDS`,
`COHORTMEMBER_TTL_SECONDS`, `TENANT_TTL_SECONDS`, `FORM_TTL_SECONDS`.
`usertenant` and `userroles` use an inline `600` rather than a named constant.

---

## 3. Module-by-module: what is cached

### 3.1 user — [`src/user/user.service.ts`](src/user/user.service.ts)

| Read | Namespace | Key | dependsOn | TTL |
|---|---|---|---|---|
| `findAllUserDetails` (`POST /user/list`) | `userlist:{tenantId}` | `hash({userSearchDto, includeCustomFields})` | — | 180s |
| `getCachedUserCoreRow` (`GET /user/read/:userId`) | `user:{userId}` | `core:{tenantId ?? "no-tenant"}` | `ufields:{userId}` | 900s |

**Tenant-less `/list` calls bypass the cache entirely** — `findAllUserDetails`
delegates straight to `findAllUserDetailsUncached` when `tenantId` is missing.
There is no sound tenant to key or invalidate by, and that caller feeds an
auth-adjacent domain-email lookup.

**Two-tier interaction worth knowing:** `getBulkCustomFieldDetails` (the
`ufields` cache) is called *inside* the loader wrapped by `userlist`. A
`userlist` hit therefore short-circuits the whole loader and `ufields` is never
consulted. Repeating one identical `/list` will show `ufields` at 0% hit rate —
that is the design working, not a fault. `ufields` earns its keep when the same
users resurface through a *different* path (another filter, `/cohortmember/list`,
`/user/read/:userId`).

### 3.2 fields / fieldValues — [`src/fields/fields.service.ts`](src/fields/fields.service.ts)

| Read | Namespace | Key | dependsOn | TTL |
|---|---|---|---|---|
| `GET /fields/formFields` | `fields:global` | `formFields:{context}:{contextType}` | `fieldsdef` | 3600s |
| `POST /fields/search` | `fields:{tenantId ?? "global"}` | `search:{hash(dto)}` | `fieldsdef` | 3600s |
| `POST /fields/options/read` | `fields:global` | `options:{hash(dto)}` | `fieldsdef` | 3600s |
| `filterUserUsingCustomFieldsOptimized` | `userfilter` | `{context}:{hash(stateDistBlockData)}` | — | 300s |
| `getBulkCustomFieldDetails` | `ufields:{userId}` / `cfields:{cohortId}` | `data` | `fieldsdef` | 3600s |

Notes:

- **`formFields` and `options` are NOT tenant-scoped** — they use the literal
  `fields:global`. Only `/fields/search` is per-tenant. Definition writes bump
  both `fields:global` and `fields:{tenantId}`, so this stays correct, but do
  not assume a tenant-shaped key here.
- `userfilter` is one cache with **three call sites** — `fields.service`,
  `cohort.service`, `cron.service`.
- `getBulkCustomFieldDetails` is the only `bulkGetOrLoad` in the codebase. It
  picks the namespace prefix from `tableName`: `Users` → `ufields`, `Cohort` →
  `cfields`. Any other table is not cached.

### 3.3 cohort — [`src/cohort/cohort.service.ts`](src/cohort/cohort.service.ts)

All four reads use `cohort:{tenantId}`, `dependsOn: ["fieldsdef"]`, TTL 300s.

| Read | Key |
|---|---|
| `GET /cohort/cohortHierarchy/:id` (with children) | `read:{cohortId}:child:cf{0\|1}` |
| `GET /cohort/cohortHierarchy/:id` (no children) | `read:{cohortId}:nochild` |
| `POST /cohort/search` | `search:{hash({academicYearId, cohortSearchDto})}` |
| `GET /cohort/mycohorts/:userId` | `mycohorts:{userId}:child{0\|1}:cf{0\|1}` |

`mycohorts` additionally declares `dependsOn: ["cohortmember:{tenantId}", "fieldsdef"]`.

**Design invariant:** a membership change bumps `cohortmember:{t}` and
`userlist:{t}` — it does **not** bump `cohort:{t}`. `mycohorts` stays fresh
because of that `dependsOn`, not because the cohort namespace moved. Do not
"fix" this by adding a `cohort:{t}` bump to membership writes.

**`POST /cohort/geographical-hierarchy` is deliberately not cached** — the
endpoint takes no tenant id (only `academicyearid`) and a user can span
tenants, so there is no sound tenant to key or invalidate by.

### 3.4 cohortMembers — [`src/cohortMembers/cohortMembers.service.ts`](src/cohortMembers/cohortMembers.service.ts)

Both reads use `cohortmember:{tenantId}`, `dependsOn: ["fieldsdef", "userlist:{tenantId}"]`, TTL 180s.

| Read | Key |
|---|---|
| `GET /cohortmember/read/:cohortId` | `read:{cohortId}:{academicYearId}:cf{0\|1}` |
| `POST /cohortmember/list` | `list:{hash({dto, academicyearId})}` |

The list path hydrates member user details through the **shared `ufields`**
bulk cache — a cross-module hit-rate win. The `read/:cohortId` path uses a
separate local query and does **not** route through `ufields`.

### 3.5 tenant, forms, user-tenant, roles

| Read | Namespace | Key | dependsOn | TTL |
|---|---|---|---|---|
| `GET /tenant/read` | `tenant` | `read:all` | — | 3600s |
| `POST /tenant/search` | `tenant` | `search:{hash(dto)}` | — | 3600s |
| `GET /form/read` | `form:{tenantId ?? "global"}` | `read:{context}:{contextType}` | `fieldsdef` | 3600s |
| `GET /user-tenant/:userId` | `usertenant:{userId}` | `mappings:{all\|active}` | — | 600s |
| `GET /rbac/usersRoles/:userId` | `userroles:{userId}` | `role` | — | 600s |

`userroles` is keyed **per-user, not per (tenant, user)** as originally planned:
the GET reads by userId with no tenant filter, and `DELETE /rbac/usersRoles`
carries no tenantId to invalidate with.

### 3.6 Not cached (deliberate)

`/user/check`, `/user/suggestUsername`, OTP / password / presigned-URL flows,
`POST /cohort/geographical-hierarchy`, all write endpoints, and every
tenant-less `/user/list` call. Auth flows, tokens and existence checks are out
of scope by design.

Modules with **no caching yet**: locations, roles listing, privileges, academic
years, role-permission map.

---

## 4. Invalidation matrix (every hooked write path)

`invalidate()` is called at 26 sites across 11 files. All run after the DB
write.

### user — [`user.service.ts`](src/user/user.service.ts)

| Write | Bumps |
|---|---|
| `POST /user/create` (custom fields written) | `ufields:{id}`, `userfilter` |
| `PATCH /user/update/:userid` (custom fields) | `ufields:{id}` |
| `PATCH /user/update/:userid` (user data or fields) | `user:{id}`, `userfilter`, `userlist:{each tenant the user maps to}` |
| `assignUserToTenantAndRoll` | `user:{id}`, `usertenant:{id}`, `userroles:{id}`, `userlist:{t}` |
| `DELETE /user/delete/:userId` | `user:{id}`, `ufields:{id}`, `usertenant:{id}`, `userroles:{id}`, `userfilter`, `userlist:{each t}` |

`PATCH /update` carries no tenant in its DTO, so it reads every tenant the user
maps to and bumps each. `DELETE` captures tenant ids **before** the mapping rows
are deleted.

### fields — [`fields.service.ts`](src/fields/fields.service.ts)

| Write | Bumps |
|---|---|
| `POST /fields/values/create` | `ufields:{itemId}`, `cfields:{itemId}`, `userfilter`, `userlist:{item's tenants}` |
| `DELETE /fields/values/delete` | same, for every deleted item id |
| Field **definition** writes (`create` / `update` / `options/delete`) | `fieldsdef`, `fields:global`, `form:global`, `fields:{t}`, `form:{t}` |

The definition hook is the widest bump in the system: `fieldsdef` invalidates
every `ufields`, `cfields`, `cohort`, `cohortmember`, `fields` and `form` read
in one INCR.

Field **value** writes need no explicit `user:{id}` bump — the cached core row
declares `dependsOn: ufields:{userId}`, so the `ufields` bump already covers it.

### cohort — [`cohort.service.ts`](src/cohort/cohort.service.ts)

| Write | Bumps |
|---|---|
| `POST /cohort/create` | `cohort:{t}`, `cfields:{cohortId}`, `userfilter` |
| `PUT /cohort/update/:id` | `cohort:{t}`, `cfields:{cohortId}`, `userfilter` |
| `PATCH /cohort/updateStatus` (bulk) | `cohort:{t}` for each affected tenant |
| `DELETE /cohort/delete/:id` | `cohort:{t}`, `cohortmember:{t}`, `cfields:{cohortId}`, `userfilter` |

### cohortMembers — [`cohortMembers.service.ts`](src/cohortMembers/cohortMembers.service.ts)

| Write | Bumps |
|---|---|
| create / update / delete (single) | `cohortmember:{t}`, `userlist:{t}` |
| `bulkCreate` | `user:{each affected id}`, `cohortmember:{t}`, `userlist:{t}` |

**`DELETE` member publishes no Kafka event** — its hook is wired directly, not
co-located with a publish. Worth remembering if you go looking for hooks by
grepping for event publishes.

### Other modules

| Write | Bumps |
|---|---|
| tenant create / update / delete | `tenant` |
| `POST /form/create` | `form:global`, `form:{t}` |
| Role assign | `user:{id}`, `userroles:{id}`, `userlist:{t}` |
| Role delete (`assign-role`) | `user:{id}`, `userroles:{id}`, `userlist:{mapping tenants}` — DTO has no tenantId, so tenants come from the deleted mappings |
| Role bulkUpdate | `user:{each}`, `userroles:{each}`, `userlist:{t}` |
| `DELETE /rbac/roles/:roleId` cascade | `user:{each}`, `userroles:{each}`, `userlist:{role's tenant}` — the cascade deletes all `UserRoleMapping` rows for the role |
| `POST /assign-tenant` with customField | `user:{id}`, `ufields:{id}`, `userfilter` |
| `PATCH /user-tenant` status update | `user:{id}`, `usertenant:{id}`, `userlist:{t}` |
| SSO create user | `ufields:{id}`, `userfilter` |
| SSO update user | `user:{id}`, `ufields:{id}`, `userfilter` |
| cron tenant-status | `user:{id}`, `usertenant:{id}`, `userlist:{t}`, `cohortmember:{t}` |
| cron pragyanpath | `user:{id}`, `usertenant:{id}`, `userroles:{id}`, `userlist:{t}` |

---

## 5. Verification status

**Unit tests — 89 passing** across `cache.service.spec.ts`, `rollout-step3/4/5/6-7.spec.ts`,
`fields-ufields-cache.spec.ts`, `health.controller.spec.ts`. These mock the
store.

**Live-Redis integration — verified** by booting the real `CacheModule` against
a real Redis and inspecting keys with `redis-cli`. Confirmed working:

- hit/miss and TTL (`PTTL` 899,966ms for a 900s TTL)
- INCR invalidation; next read fresh
- **multi-pod**: an INCR from one process invalidates another immediately
- **stale-write race**: loader held open past an INCR — the late SET landed as
  an unreachable orphan and the next read returned the new value
- no negative caching: `null` / `[]` / `false` wrote zero keys
- `dependsOn` version embedding, and epoch bumps invalidating dependents
- bulk hydration fetching only missing ids; per-record invalidation not cooling siblings
- Redis-down passthrough, circuit breaker opening, 0ms ops once open
- `CACHE_DISABLED_NAMESPACES` family + exact matching; INCRs still running while bypassed

---

## 6. Known issues — read before enabling Redis

`.env` currently runs `CACHE_ENABLED=true` with `CACHE_PROVIDER=memory` and an
empty `REDIS_URL`. **No environment has run the Redis path yet.** Both issues
below are Redis-only and activate the moment `CACHE_PROVIDER=redis` is set.

### 6.1 Split keyspace — wiping `ums:*` resurrects stale data ⚠️

Value entries and version counters land in **different keyspaces**:

```
counters (raw redis client):  ums:v:user:u1
values   (via Keyv):          keyv::keyv:ums:user:u1:v1:core
```

The `CACHE_KEY_PREFIX` is only inside the key body — neither Keyv layer in
[`cache.module.ts`](src/cache/cache.module.ts) is given a prefix, and Keyv adds
its own `keyv::keyv:`.

Consequence: `redis-cli --scan --pattern 'ums:*'` shows **only counters, zero
value entries**. An operator who "wipes this service's keys" by that pattern
deletes the counters, which reset to 1 — making pre-invalidation `v1` entries
reachable again. This was reproduced: a read returned data from *before* an
invalidation. Fix the prefixing before enabling Redis anywhere real.

### 6.2 Shutdown hangs when Redis is unreachable

`CacheModule.onApplicationShutdown` awaits `redisHandle.disconnect()` with no
timeout. With Redis unreachable this did not resolve after 5s. Root cause is
`getClient()`, which never resolves on an unreachable Redis — the request path
survives only because `withTimeout` wraps it; shutdown has no such guard. Risk
is stuck pod terminations during a Redis outage.

### 6.3 Redis path is not covered by CI

Jest's `moduleNameMapper` maps `keyv`, `cache-manager` and `@keyv/redis` to
their CJS builds but misses **`hookified`**, so any spec importing the real
store fails with `SyntaxError: Unexpected token 'export'`. That is why all 89
tests mock the store and `RedisCacheVersionStore` has zero coverage. One mapper
line fixes it:

```json
"^hookified$": "<rootDir>/../node_modules/hookified/dist/node/index.cjs"
```

---

## 7. Adding a new cached read — checklist

1. Pick the pattern: full response (wide ns + body hash), per-entity
   (narrow ns per id), derived result (wide ns + input hash), or in-process memo.
2. Add the namespace, key shape, TTL and `dependsOn` to §2 and §3 of this doc.
3. **Enumerate every write path** that touches the underlying data and hook it
   in §4. Grep repository writes *and* event publishes — and remember some
   writes (member delete, reference-data modules) publish no event at all.
4. Declare `dependsOn` for every joined entity that can change independently.
5. Invalidate **after commit only**, never before, never on a failed write.
6. Never cache empty results.
7. Test: hit, miss, write→next-read-fresh, Redis-down passthrough.
8. Ship behind `CACHE_ENABLED=false` and enable per environment (dev → QA →
   prod), never on by default in the PR that introduces it.

## 8. Rollout and rollback

**Dev (memory):** `CACHE_ENABLED=true`, `CACHE_PROVIDER=memory`. Correctness
first, hit rate second — exercise a write→read cycle on each live namespace and
confirm the new value appears on the *next* request. A stale read is a missing
invalidation hook, not a tuning problem. `error` and `bypass` must be **zero**
on memory; anything else is a bug.

**QA (Redis, multi-pod):** set `CACHE_PROVIDER=redis` and `REDIS_URL`, keep
`CACHE_KEY_PREFIX=ums`. Version counters become shared — this is the property
memory cannot demonstrate. Watch `error` / `bypass` and the circuit-breaker log.
Verify `/health` stays green with Redis stopped. **Resolve §6.1 first.**

**Prod:** enable one module at a time with a soak between each.

**Turning one namespace off** — config, no redeploy:

```
CACHE_DISABLED_NAMESPACES=userlist,cohort
CACHE_DISABLED_NAMESPACES=cohort:11111111-1111-4111-8111-111111111111
```

Matching is by family (before the first `:`) or exact namespace. Invalidation
INCRs still run while bypassed, so re-enabling is safe. Current value is visible
at `GET /health` under `cache.disabledNamespaces`.

**Full stop:** `CACHE_ENABLED=false` — instant, deploy-free rollback of the
entire layer.
