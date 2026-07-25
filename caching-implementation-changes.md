# Caching Implementation — Before / After (Module-wise, API-wise)

This document is a **change record**: for every API that got caching added,
what it did **before** this work versus what it does **after**, module by
module, with the exact Redis namespace, key shape, TTL, and what invalidates
it. All facts below are read directly from `src/**/*.service.ts` — not from
a plan.

For how the caching engine itself works (config vars, resilience, the
versioned-namespace mechanism, known issues), see
[`caching-strategy.md`](caching-strategy.md). This document only covers the
per-API delta.

**Before, universally:** every one of these APIs queried Postgres directly on
every single call — no cache layer existed. That is the "Before" state for
every row below and is not repeated per-row beyond a short note.

---

## 1. user module — [`user.service.ts`](src/user/user.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `POST /user/list` (`findAllUserDetails`) | Direct DB query every call | `userlist:{tenantId}` | `hash({userSearchDto, includeCustomFields})` | 3 min (180s) | — | user create/update/delete, role assign/delete/bulk, `DELETE /rbac/roles/:id` cascade, user-tenant status update, field-value create/delete, cohortMembers bulk publish, cron tenant-status/pragyanpath |
| `GET /user/read/:userId` (`getCachedUserCoreRow`) | Direct DB query every call | `user:{userId}` | `core:{tenantId ?? "no-tenant"}` | 15 min (900s) | `ufields:{userId}` | user update, user delete, role assign/delete/bulk, `DELETE /rbac/roles/:id` cascade, user-tenant status update, `POST /assign-tenant`, SSO update, cron tenant-status/pragyanpath |

Note: `POST /user/list` called **without a tenantId** (the tenant-less domain
email lookup) bypasses the cache entirely — before and after are identical for
that caller, since there is no sound tenant to key or invalidate by.

---

## 2. fields / fieldValues module — [`fields.service.ts`](src/fields/fields.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /fields/formFields` | Direct DB query every call | `fields:global` | `formFields:{context}:{contextType}` | 1 h (3600s) | `fieldsdef` | field definition create/update, options delete |
| `POST /fields/search` | Direct DB query every call | `fields:{tenantId ?? "global"}` | `search:{hash(dto)}` | 1 h (3600s) | `fieldsdef` | field definition create/update, options delete |
| `POST /fields/options/read` | Direct DB query every call | `fields:global` | `options:{hash(dto)}` | 1 h (3600s) | `fieldsdef` | field definition create/update, options delete |
| `filterUserUsingCustomFieldsOptimized` (called from user search, cohort search, cron) | Direct DB query every call, 3 call sites | `userfilter` | `{context}:{hash(stateDistBlockData)}` | 5 min (300s) | — | user create/update/delete, cohort create/update/delete, field-value create/delete |
| Bulk custom-field hydration (`getBulkCustomFieldDetails`, called for `Users`/`Cohort`) | Per-record DB query every call (N+1) | `ufields:{userId}` / `cfields:{cohortId}` | `data` | 1 h (3600s) | `fieldsdef` | see user / cohort invalidation rows — any write touching that user's or cohort's field values |

**`fieldsdef` is a global epoch namespace** — it holds no cached entries of
its own. Before this work there was no equivalent concept; after, one INCR on
any field-definition write invalidates every `ufields`, `cfields`, `cohort`,
`cohortmember`, `fields`, and `form` entry across **all tenants** at once.

---

## 3. cohort module — [`cohort.service.ts`](src/cohort/cohort.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /cohort/cohortHierarchy/:id` (with children) | Direct DB query every call | `cohort:{tenantId}` | `read:{cohortId}:child:cf{0\|1}` | 5 min (300s) | `fieldsdef` | cohort create/update/delete, `updateStatus` bulk |
| `GET /cohort/cohortHierarchy/:id` (no children) | Direct DB query every call | `cohort:{tenantId}` | `read:{cohortId}:nochild` | 5 min (300s) | `fieldsdef` | same as above |
| `POST /cohort/search` | Direct DB query every call | `cohort:{tenantId}` | `search:{hash({academicYearId, cohortSearchDto})}` | 5 min (300s) | `fieldsdef` | same as above |
| `GET /cohort/mycohorts/:userId` | Direct DB query every call | `cohort:{tenantId}` | `mycohorts:{userId}:child{0\|1}:cf{0\|1}` | 5 min (300s) | `cohortmember:{tenantId}`, `fieldsdef` | cohortMembers create/update/delete/bulkCreate — **not** cohort writes (design invariant, see below) |

**Design invariant kept from before → after:** a cohort **membership** change
never bumps `cohort:{t}`. `mycohorts` stays fresh purely because it declares
`dependsOn: cohortmember:{t}`.

**Unchanged (not cached):** `POST /cohort/geographical-hierarchy` — the
endpoint carries no tenant id (only `academicyearid`) and a user can span
tenants, so there is no sound key/invalidation target. Before and after are
identical for this endpoint.

---

## 4. cohortMembers module — [`cohortMembers.service.ts`](src/cohortMembers/cohortMembers.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /cohortmember/read/:cohortId` | Direct DB query every call | `cohortmember:{tenantId}` | `read:{cohortId}:{academicYearId}:cf{0\|1}` | 3 min (180s) | `fieldsdef`, `userlist:{tenantId}` | member create/update/delete/bulkCreate, cron assign-students |
| `POST /cohortmember/list` | Direct DB query every call | `cohortmember:{tenantId}` | `list:{hash({dto, academicyearId})}` | 3 min (180s) | `fieldsdef`, `userlist:{tenantId}` | same as above |

Member user-detail hydration inside these reads now goes through the shared
`ufields:{userId}` bulk cache from the fields module (before: a per-user
lookup on every call) — a cross-module hit-rate gain with no new namespace of
its own.

---

## 5. tenant module — [`tenant.service.ts`](src/tenant/tenant.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /tenant/read` | Direct DB query every call | `tenant` | `read:all` | 1 h (3600s) | — | tenant create, update, delete |
| `POST /tenant/search` | Direct DB query every call | `tenant` | `search:{hash(dto)}` | 1 h (3600s) | — | tenant create, update, delete |

Tenant writes publish no Kafka event, so the invalidation hook is called
directly inside the create/update/delete methods rather than co-located with
a publish.

---

## 6. forms module — [`forms.service.ts`](src/forms/forms.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /form/read` | Direct DB query every call | `form:{tenantId ?? "global"}` | `read:{context}:{contextType}` | 1 h (3600s) | `fieldsdef` | `POST /form/create`, any field-definition write |

---

## 7. userTenantMapping module — [`user-tenant-mapping.service.ts`](src/userTenantMapping/user-tenant-mapping.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /user-tenant/:userId` | Direct DB query every call | `usertenant:{userId}` | `mappings:{all\|active}` | 10 min (600s) | — | `assignUserToTenantAndRoll` (create/SSO/assign-tenant), user delete, `PATCH /user-tenant` status update, cron tenant-status/pragyanpath |

---

## 8. rbac / roles module — [`assign-role.service.ts`](src/rbac/assign-role/assign-role.service.ts)

| API | Before | After — Namespace | Key | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|---|---|
| `GET /rbac/usersRoles/:userId` | Direct DB query every call | `userroles:{userId}` | `role` | 10 min (600s) | — | role assign, role delete, role bulkUpdate, `DELETE /rbac/roles/:roleId` cascade, user delete, `assignUserToTenantAndRoll`, cron tenant-status/pragyanpath |

**Deviation from the original per-tenant plan:** this is keyed by **userId
alone**, not `{tenantId}:{userId}` — the GET has no tenant filter, and the
DELETE endpoint carries no tenantId to invalidate with. Before and after this
work, the endpoint's request/response shape is unchanged; only the caching
key differs from what was originally proposed.

---

## 9. Not cached before, still not cached after (deliberate)

| Endpoint / flow | Reason |
|---|---|
| `POST /user/check` | Existence check — out of scope by design |
| `POST /user/suggestUsername` | Out of scope by design |
| OTP / password / presigned-URL flows | Auth-adjacent — out of scope by design |
| `POST /cohort/geographical-hierarchy` | No tenant id in request scope; user can span tenants |
| All write/create/update/delete endpoints | Writes are never cached |
| `POST /user/list` without a tenant | No sound tenant to key/invalidate by; feeds an auth-adjacent domain-email lookup |
| locations, roles listing, privileges, academic years, role-permission map | Not yet onboarded to caching |

---

## 10. Namespace → TTL quick reference

| Namespace | Width | TTL | Module |
|---|---|---|---|
| `user:{userId}` | narrow | 15 min | user |
| `userlist:{tenantId}` | wide | 3 min | user |
| `ufields:{userId}` | narrow | 1 h | fields |
| `cfields:{cohortId}` | narrow | 1 h | fields |
| `userfilter` | wide | 5 min | fields |
| `fields:{tenantId}` / `fields:global` | wide | 1 h | fields |
| `fieldsdef` | global epoch (no entries) | — | fields |
| `cohort:{tenantId}` | wide | 5 min | cohort |
| `cohortmember:{tenantId}` | wide | 3 min | cohortMembers |
| `tenant` | wide | 1 h | tenant |
| `form:{tenantId}` / `form:global` | wide | 1 h | forms |
| `usertenant:{userId}` | narrow | 10 min | userTenantMapping |
| `userroles:{userId}` | narrow | 10 min | rbac/roles |

13 namespaces total, matching the 13 covered in §1–§8 above.

---

## 11. Response-time impact

**What's verified vs. what's estimated, stated plainly:** the environment
this document was produced in cannot reach the project's Postgres host
(`POSTGRES_HOST` in `.env` times out from here — likely VPC/security-group
restricted), so no live before/after millisecond numbers for these specific
APIs could be measured. Nothing below is a fabricated benchmark. What *is*
verified is the structural behavior; what follows that is order-of-magnitude
reasoning, explicitly labeled.

### Verified: what happens on repeat calls

Booting the real `CacheService` against a live Redis and calling the same
`getOrLoad` twice with an identical namespace/key:

- **1st call (cache miss):** the DB loader runs exactly as it did before this
  work — same query, same round-trip, same cost as pre-caching.
- **2nd+ call within the TTL (cache hit):** the DB loader is **not invoked at
  all** — confirmed by instrumenting the loader with a call counter, which
  stayed at 1 after multiple identical reads. The response is served from one
  Redis `MGET` (version counters) + one `GET` (the entry) instead.

This holds for every namespace in §10 with the same mechanism — a hit means
zero DB round-trips, full stop, not a "faster query."

### Estimated: relative magnitude (not measured)

| | Typical cost | Notes |
|---|---|---|
| Cache hit (Redis `MGET`+`GET`) | roughly 1–5 ms on a same-region network | Bounded above by `CACHE_OP_TIMEOUT_MS` (150 ms default) — a slow Redis op is treated as a miss, never adds unbounded latency |
| DB miss path (unchanged from before) | ranges from a few ms (indexed single-row read, e.g. `usertenant`/`userroles`) to hundreds of ms+ (joined/filtered list queries against large tables, e.g. `POST /user/list`, `POST /cohort/search`) | Exact cost depends on table size and filter selectivity in each environment — this is why no single number is quoted |

The APIs most likely to show the largest wins are the ones whose uncached
query is a multi-table join over a large result set — `POST /user/list`,
`POST /cohort/search`, `POST /cohortmember/list`, and the `ufields`/`cfields`
bulk hydration (which replaces N+1 per-record queries with 2 Redis
round-trips regardless of N). Narrow single-row lookups (`user:{id}`,
`usertenant:{id}`, `userroles:{id}`) save less in absolute terms per call, but
are hit far more often.

### How to get real numbers

1. **Read actual hit rates in any environment where this is running:** the
   `cache metrics {...}` log line (every `CACHE_METRICS_INTERVAL_MS`, default
   60s) reports live `hit/miss/error/bypass` counts per namespace family —
   this is the direct evidence of how often the DB is being skipped.
2. **To get real before/after latency in milliseconds:** time the same
   request twice — first call cold (or right after
   `CACHE_DISABLED_NAMESPACES` includes it), second call warm — against an
   environment where Postgres and Redis are both reachable, and record actual
   `curl -w '%{time_total}'` or APM timings. I can write that benchmark script
   on request; it just needs to be run somewhere with DB access, since this
   session doesn't have it.

---

For rollout steps, `CACHE_ENABLED` / `CACHE_PROVIDER` / `REDIS_URL` config,
the circuit breaker, `/health` reporting, and the two open Redis-provider
issues (keyspace-split stale-data hazard, shutdown hang), see
[`caching-strategy.md`](caching-strategy.md) §1, §6, and §8.
