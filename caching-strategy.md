> Exported from `Caching_strartegy.docx` so it can live in the repo at `docs/caching-strategy.md` and be read directly by Claude Code. This is the canonical spec — see `claude-code-implementation-prompts.md` for the step-by-step build order derived from it. Keep §2 updated as namespaces go live (per §2.2: a service section here is "the prerequisite for its implementation PRs").

# Platform Caching Strategy & Service Plans

This document has two parts:

- **Part 1 — Platform strategy:** how caching works on Redis/memory, irrespective of which service adopts it. Any service (user, event, notification, tracking, …) follows this contract.

- **Part 2 — Service plans:** per-service, per-module detail of exactly which APIs/queries are cached, with what keys, and what invalidates them. User Service is first; other services get their own sections as they onboard.

# Part 1 — Platform Caching Strategy (service-agnostic)

## 1.1 Goals & non-goals

**Goals**

1.  Reduce latency and DB load on read-heavy APIs.

2.  **Zero stale data**: a completed write is reflected by the very next read, across all pods.

3.  Zero hard dependency on Redis: if Redis is slow or down, every request still succeeds via the database.

4.  Pluggable stores: Redis in shared/multi-pod environments, in-memory for local dev, other adapters config-only.

5.  Instant, deploy-free rollback of any cache.

**Non-goals**

- Caching writes, auth flows, tokens, OTPs, presigned URLs, or existence checks.

- Serving stale data as a fallback when Redis recovers or the DB is down (we never do this).

- Cross-service shared cache entries (each service owns its keys exclusively).

## 1.2 Topology & stack

| **Environment**           | **Store**               | **Why**                                                                    |
|---------------------------|-------------------------|----------------------------------------------------------------------------|
| Local / dev               | In-memory (per process) | No infra needed; identical semantics                                       |
| QA / Prod (multi-pod K8s) | Redis                   | Shared source of truth across replicas; in-memory would drift between pods |

- NestJS stack: @nestjs/cache-manager + cache-manager v6 (Keyv) with @keyv/redis. A global CacheModule exposes one CacheService; application code never touches the store directly.

- Every service uses its own key prefix (e.g. ums: for user-microservice) so a shared Redis can host multiple services without collisions and ops can inspect/wipe one service's keys safely.

### Config contract (same env vars in every service)

| **Variable**                             | **Default**        | **Meaning**                                               |
|------------------------------------------|--------------------|-----------------------------------------------------------|
| CACHE_ENABLED                            | false              | Master switch; false = every cache call is a pass-through |
| CACHE_PROVIDER                           | memory             | memory \| redis                                           |
| REDIS_URL                                | —                  | Required when provider is redis                           |
| CACHE_KEY_PREFIX                         | service short-name | e.g. ums                                                  |
| CACHE_DISABLED_NAMESPACES                | empty              | Comma-separated namespaces to bypass at runtime           |
| CACHE_OP_TIMEOUT_MS                      | 150                | Per-operation Redis timeout                               |
| CACHE_CB_FAILURES / CACHE_CB_COOLDOWN_MS | 5 / 30000          | Circuit-breaker thresholds                                |

## 1.3 The one invalidation primitive: versioned namespaces

Everything — from a tenant-wide search cache down to a single user's record — lives in a **namespace** with a version counter:

version counter: {prefix}:v:{namespace} e.g. ums:v:user:8f3a… = 12  
cache entry: {prefix}:{namespace}:v{N}:{key} e.g. ums:user:8f3a…:v12:fields

- **Read:** MGET the version counters (own namespace + declared dependencies) → build the key with versions embedded → GET → hit? return : run DB loader, SET … EX ttl.

- **Invalidate:** INCR the version counter. One atomic O(1) operation; every entry under the old version — hundreds of search-filter combinations included — becomes unreachable instantly on **all pods**. Orphans are reclaimed by TTL. No SCAN, no key registries, no enumeration.

- A namespace can be **wide** (userlist:{tenantId} — all list/search results for a tenant) or **narrow** (user:{userId} — one person's record). Narrow namespaces make invalidation surgical; wide ones cover unenumerable query results.

- Missing counters initialize to 1. Counters have no TTL (bytes are negligible).

### Why INCR-only (never DEL) — the stale-write race

Cache-aside with DEL has a classic race that can pin stale data until TTL:

t1 READ: cache miss → starts DB query (sees old row)  
t2 WRITE: commits new row → DEL cache key  
t3 READ: finishes → SET cache key = OLD data ← stale until TTL!

With versioned keys the race is harmless: the read fetched version v12 *before* its DB query; the write's INCR moves the namespace to v13; the read's late SET lands under …:v12:… — an orphan nobody will ever request. **This is why even per-record caches use a version counter instead of DEL.** This property is load-bearing for the zero-stale-data goal.

### Rules that guarantee no stale data

1.  **Evict after commit, never before:** the INCR runs only after the DB write succeeds (decorator/helper enforces ordering). A failed write must not invalidate.

2.  **Every write path enumerated:** a namespace may only be introduced together with a written-down list of *all* code paths that mutate its underlying data (see the invalidation matrices in Part 2). PR review checklist item.

3.  **Dependencies declared at the read site:** if a cached read joins other entities, it declares dependsOn: \[namespaces\]; their versions are embedded in its key too. A write bumps only its own namespace and every dependent read everywhere goes stale automatically.

4.  **Version read before loader:** the implementation always resolves versions before executing the DB loader (this is what makes rule "race-safe" above hold).

5.  **No negative caching:** empty/false results are not cached (avoids "stale empty" after a create).

6.  **TTL is a safety net only**, never the correctness mechanism. Short TTLs (minutes) bound the blast radius of any bug in rules 1–5.

7.  **Out-of-band writers:** if a service's tables are ever written by another service/script/manual SQL, that data class must either not be cached or use TTL-only with explicitly accepted staleness. (User Service confirmed: only the service itself writes its DB.)

## 1.4 Caching patterns (choose per API/query)

| **Pattern**                 | **What is cached**                                                | **Key shape**                              | **Invalidation**                    | **Use when**                                                                                       |
|-----------------------------|-------------------------------------------------------------------|--------------------------------------------|-------------------------------------|----------------------------------------------------------------------------------------------------|
| **A. Response cache**       | Full API/service-method result                                    | wide ns + SHA-1 of normalized request body | INCR wide ns on any relevant write  | Search/list APIs where clients repeat queries; results not decomposable                            |
| **B. Per-entity hydration** | One record's processed data (row, custom fields)                  | narrow ns per record id                    | INCR that record's ns on its writes | Data fetched by id inside many different requests (the "same users appear in every search" effect) |
| **C. Derived-result cache** | Result of an expensive intermediate query (e.g. filter → id list) | wide ns + hash of inputs                   | INCR wide ns; short TTL             | Repeated expensive sub-queries whose result set can change from many places                        |
| **D. In-process memo**      | Static per-deploy metadata (entity column names, enum maps)       | process memory, no Redis                   | none (immutable per deploy)         | Metadata that cannot change at runtime                                                             |

**The bulk-hydration idiom (pattern B at scale):** for N ids — one MGET of the N version counters, one MGET of the N value keys, DB query **only for the missing ids**, backfill their entries. Two Redis round-trips regardless of N. Hit rate is high because different searches/pages/modules keep resolving the same records; invalidation is per-record, so one user's update never cools anyone else's cache.

## 1.5 Redis-outage resilience (identical in every service)

1.  Every Redis op: try/catch + CACHE_OP_TIMEOUT_MS timeout → any failure counts as a **miss**; the DB loader runs; errors are logged as warnings, never surfaced to the request.

2.  **Circuit breaker:** after CACHE_CB_FAILURES consecutive failures, bypass Redis entirely for CACHE_CB_COOLDOWN_MS, then probe. A dead Redis must not add timeout latency to every request.

3.  Redis unreachable ⇒ version counters unreadable ⇒ all reads go to the DB. **Correct, never stale.** After a Redis flush/restart, counters re-initialize ⇒ cold cache, never wrong data.

4.  If a post-write INCR fails (circuit open), reads are also bypassing cache, and TTLs bound residual exposure once Redis returns. Logged at error level.

5.  /health reports Redis informationally; it never fails the health check.

## 1.6 Observability & rollout discipline

- Per-namespace counters: **hit / miss / error / bypass(circuit-open)**, logged periodically; debug log on every INCR with namespace + caller.

- New namespaces ship behind CACHE_ENABLED=false, are enabled in dev (memory) → QA (Redis) → prod, one module at a time.

- A namespace whose QA hit rate doesn't pay for itself is turned off via CACHE_DISABLED_NAMESPACES — config, not code.

### Checklist for caching any new API (PR template)

- ☐ Pattern chosen (A/B/C/D) and justified

- ☐ Namespace + key + TTL documented in this file's service section

- ☐ **All** write paths to the underlying data enumerated and hooked (grep for repository writes and event publishes)

- ☐ dependsOn declared for every joined entity that can change independently

- ☐ Eviction runs after commit only

- ☐ No negative caching

- ☐ Tests: hit, miss, write→next-read-fresh, Redis-down passthrough

# Part 2 — Service Plans

## 2.1 User Service (user-microservice, prefix ums:)

**Module priority (agreed):** user, cohort, fields/fieldValues, cohortMembers first; tenant, forms next; remaining reference data (locations, roles, privileges, academic years, role-permission) after.

**Preconditions verified:** only this service writes its DB; Kafka events (USER\_\*, COHORT\_\*, COHORT_MEMBER\_\*, USER_TENANT\_\*) mark most mutation points — eviction hooks co-locate with those publishes; reference-data modules without events get hooks added directly in their write methods.

### Namespace catalog

| **Namespace**                 | **Width** | **Pattern** | **Holds**                                                     |
|-------------------------------|-----------|-------------|---------------------------------------------------------------|
| user:{userId}                 | narrow    | B           | one user's core row (name, email, status, …)                  |
| ufields:{userId}              | narrow    | B           | one user's processed custom-field details                     |
| userlist:{tenantId}           | wide      | A           | /list, hierarchy-view, hierarchical-search results / id-lists |
| userfilter                    | wide      | C           | custom-field filter → userId/cohortId lists                   |
| usertenant:{userId}           | narrow    | A           | user's tenant mappings                                        |
| userroles:{userId}            | narrow    | A           | user's assigned roles — implemented per-user, NOT the originally planned userroles:{tenantId}:{userId}: the GET reads by userId with no tenant filter, and DELETE /rbac/usersRoles carries no tenantId to invalidate with |
| cohort:{tenantId}             | wide      | A           | cohort search / hierarchy / geo-hierarchy results             |
| cfields:{cohortId}            | narrow    | B           | one cohort's processed custom-field details                   |
| cohortmember:{tenantId}       | wide      | A           | member read/list results                                      |
| tenant                        | wide      | A           | tenant read/search (phase 2)                                  |
| form:{tenantId}               | wide      | A           | form read (phase 2)                                           |
| fields:{tenantId}             | wide      | A           | field definitions / formFields / options (phase 2)            |

### 2.1.1 user module — query-level (two-tier) caching

POST /list → searchUser → findAllUserDetails (user.service.ts:779) decomposes into cacheable layers:

| **\#** | **Cached thing**                                                    | **Pattern**            | **Namespace / key**                         | **TTL** | **Notes**                                                                                                             |
|--------|---------------------------------------------------------------------|------------------------|---------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------------|
| 1      | getBulkCustomFieldDetails(userIds,'Users') (fields.service.ts:1921) | **B (bulk hydration)** | ufields:{userId} per user                   | 1 h     | Biggest win: same users recur across all searches/pages and in cohort-member reads. MGET + backfill only missing ids. |
| 2      | filterUserUsingCustomFieldsOptimized (fields.service.ts:1541)       | **C**                  | userfilter + hash(context, filterMap)       | 5 min   | Also called from cohort.service.ts:955, cron.service.ts:162 — one cache, three call sites.                            |
| 3      | Main search query (id-resolution)                                   | **A**                  | userlist:{tenantId} + hash(normalized body) | 3 min   | Phase 1: cache as-is. Phase 1.5 refactor: query selects only userId+total_count; core columns hydrate from \#4.       |
| 4      | User core row (post-refactor)                                       | **B**                  | user:{userId}                               | 1 h     | Includes role + tenantStatus columns ⇒ extra invalidation triggers below.                                             |
| 5      | getCoreColumnNames (user.service.ts:121)                            | **D**                  | in-process memo                             | deploy  | Entity metadata; currently recomputed on every filtered search.                                                       |
| 6      | GET /read/:userId                                                   | **B**                  | user:{userId} (+ ufields:{userId} dep)      | 15 min  | Single-user read.                                                                                                     |

**Not cached:** /check, /suggestUsername, OTP/password/presigned-url flows, all writes.

**Invalidation matrix — user data (every known write path):**

| **Write path**                                                                  | **Bumps (INCR)**                                                    |
|---------------------------------------------------------------------------------|---------------------------------------------------------------------|
| POST /create (user.service.ts ~1916, publishes USER_CREATED)                    | userlist:{t} (+ ufields:{id} if custom fields written at create)    |
| PATCH /update/:userid (~1476, USER_UPDATED) — updates Users **and** FieldValues | user:{id}, ufields:{id}, userlist:{t}, userfilter                   |
| DELETE /delete/:userId (~2861, USER_DELETED)                                    | user:{id}, ufields:{id}, userlist:{t}, userfilter                   |
| SSO authenticate creating/updating users (sso.service.ts:376/378/636)           | same as create/update                                               |
| cohortMembers.service.ts:1193 user-affecting publish                            | user:{id}, userlist:{t}                                             |
| POST /fields/values/create, DELETE /fields/values/delete targeting a Users item | ufields:{itemId}, userfilter, userlist:{t}                          |
| Role assign / delete / bulkUpdate (UserRolesMapping)                            | user:{id} (core row exposes role), userroles:{t}:{id}, userlist:{t} |
| User-tenant create / status update (UserTenantMapping)                          | user:{id} (exposes tenantStatus), usertenant:{id}, userlist:{t}     |
| POST /assign-tenant with customField (user-tenant-mapping.service.ts ~202) — writes Users FieldValues via updateUserCustomFields | ufields:{id}, userfilter (found during rollout step 2; was missing from this matrix) |

**Corrections found during rollout step 3** (each row verified against current code; user:{id} bumps in the original table join at step 5 when that namespace ships):

| Write path (verified location)                                                   | Bumps (INCR) — as implemented                                        |
|----------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| assignUserToTenantAndRoll (user.service.ts) — single choke point for UserRoleMapping + UserTenantMapping writes from POST /create, SSO create/update, and POST /assign-tenant | usertenant:{id}, userroles:{id}, userlist:{t}                        |
| PATCH /update/:userid — tenant not in DTO; bumps every tenant the user maps to   | ufields:{id} (if fields written), userfilter, userlist:{each t}      |
| DELETE /delete/:userId — tenant ids captured before mapping deletes              | ufields:{id}, usertenant:{id}, userroles:{id}, userfilter, userlist:{each t} |
| POST/DELETE /fields/values/{create,delete} targeting any item                    | ufields:{itemId}, userfilter, userlist:{item's tenants}              |
| PATCH /user-tenant/status update (user-tenant-mapping.service.ts)                | usertenant:{id}, userlist:{t}                                        |
| Role assign / bulkUpdate (assign-role.service.ts) — tenant from DTO/header       | userroles:{id}, userlist:{t}                                         |
| Role delete (assign-role.service.ts) — **DTO has no tenantId**; tenants read from the deleted mappings | userroles:{id}, userlist:{mapping tenants}     |
| **UNLISTED: DELETE /rbac/roles/:roleId cascade** (role.service.ts ~344) deletes all UserRoleMapping rows for the role — not in the original matrix | userroles:{each affected userId}, userlist:{role's tenant} |
| **UNLISTED: cron assignStudentsToBatches / pragyanpath** (cron.service.ts) writes UserTenantMapping + UserRoleMapping directly — original matrix only mentioned cron for cohortmember | usertenant:{id}, userroles:{id}, userlist:{t} |
| cohortMembers create/update/delete/bulkCreate — bulk publish row confirmed; single-member writes affect userlist the same way (exclude.cohortIds) and are now hooked too. **Note: DELETE member publishes no Kafka event** (contradicts §2.1 preconditions); its hook is direct. | userlist:{t} (+ cohortmember:{t} added in step 4) |

**Rollout step 4 (cohort + cohortMembers + fieldsdef):**

| Read path (verified location) | Namespace / key | dependsOn | TTL |
|---|---|---|---|
| POST /cohort/search (cohort.service.ts searchCohort) | cohort:{tenantId} + hash(body) | fieldsdef | 5 min |
| GET /cohort/cohortHierarchy/:id (getCohortsDetails; tenant from the fetched row) | cohort:{tenantId} + id + flags | fieldsdef | 5 min |
| GET /cohort/mycohorts/:userId (getCohortHierarchyData; tenant threaded from header) | cohort:{tenantId} + userId + flags | **cohortmember:{t}** + fieldsdef | 5 min |
| Cohort custom fields (getBulkCustomFieldDetails(...,'Cohort')) | cfields:{cohortId} | fieldsdef | 1 h |
| GET /cohortmember/read/:cohortId (getCohortMembers) | cohortmember:{tenantId} + id + flags | fieldsdef + userlist:{t} | 3 min |
| POST /cohortmember/list (searchCohortMembers) | cohortmember:{tenantId} + hash(body) | fieldsdef + userlist:{t} | 3 min |
| Member user-detail hydration (getCohortMemberUserDetails) | **reuses ufields:{userId}** via getBulkCustomFieldDetails — no new cache | — | — |

| Write path (verified location) | Bumps (INCR) |
|---|---|
| POST /cohort/create (cohort.service.ts createCohort, writes Cohort + FieldValues) | cohort:{t}, cfields:{cohortId}, userfilter |
| PUT /cohort/update/:id (updateCohort, writes Cohort + FieldValues) | cohort:{t}, cfields:{cohortId}, userfilter |
| PATCH /cohort/updateStatus (updateCohortStatuses, bulk) | cohort:{t} for each affected tenant |
| DELETE /cohort/delete/:id (updateCohortStatus — archives cohort, deletes members + FieldValues) | cohort:{t}, **cohortmember:{t}**, cfields:{cohortId}, userfilter |
| cohortMembers create/update/delete/bulkCreate (single + bulk) | cohortmember:{t}, userlist:{t} |
| cron assign-students member creation (cron.service.ts) | cohortmember:{t}, usertenant:{id}, userlist:{t} |
| POST /fields/create, PATCH /fields/update/:fieldId, DELETE /fields/options/delete/:fieldName (field **definitions**) | **fieldsdef** (global epoch — one bump makes all ufields/cfields/cohort/cohortmember reads stale) |
| POST/DELETE /fields/values/{create,delete} — extended in step 4 | ufields:{itemId}, **cfields:{itemId}**, userfilter, userlist:{item tenants} |

**Invariant honored (§2.1.4 note):** a cohort **membership** change bumps cohortmember:{t} and userlist:{t} — it does **NOT** bump cohort:{t}. mycohorts stays fresh because it declares dependsOn: cohortmember:{t}, not because cohort:{t} moved.

**Flags — step 4:**
- **POST /cohort/geographical-hierarchy NOT cached.** §2.1.3 row 3 assigns it cohort:{t}, but the endpoint takes no tenantid (only academicyearid) and a user can span tenants, so there's no sound tenant to key/invalidate by. Deferred rather than guessed — recommend the team decide whether to add a tenant header or accept it uncached.
- **cohort reads use the singular getCustomFieldDetails('Cohort'), not the bulk cfields path.** The cfields:{cohortId} cache is wired at getBulkCustomFieldDetails per the doc, but cohort search/hierarchy hydrate via the singular method (covered by the outer cohort:{t} response cache). cfields is populated only where the bulk method is called with 'Cohort'.
- **getCohortMembers read hydration (getUserDetails → getFieldandFieldValues) is a separate local query**, not routed through ufields. Only the list path (getCohortMemberUserDetails) was switched to the ufields-cached bulk call, since that's the one the doc's hydration row maps to.

> The last two rows exist because the hydrated core row (#4) includes role and tenantStatus from joins. If we instead keep those columns in the id-resolution query, the last two rows drop user:{id} — decide at implementation time; matrix must match the final column split.

### 2.1.2 fields / fieldValues module

Field **values** are covered per-owner above (ufields:{userId}, cfields:{cohortId}, userfilter). Field **definitions** (Phase 2): POST /fields/search, GET /fields/formFields, POST /fields/options/read under fields:{tenantId} (A, 1 h), bumped by POST /fields/create, PATCH /fields/update/:fieldId, DELETE /fields/options/delete/:fieldName. A definition change also bumps form:{tenantId} (forms embed field definitions) and ufields/cfields **wide fallback**: since a definition change alters processed values for *all* owners, it bumps a global fieldsdef epoch namespace declared as dependsOn by every ufields:{userId} and cfields:{cohortId} read — one INCR covers all records.

### 2.1.3 cohort module

| **Cached thing**                                               | **Pattern** | **Namespace / key**     | **TTL** | **dependsOn**                      |
|----------------------------------------------------------------|-------------|-------------------------|---------|------------------------------------|
| POST /cohort/search                                            | A           | cohort:{t} + body hash  | 5 min   | fieldsdef (custom-field responses) |
| GET /cohort/cohortHierarchy/:id                                | A           | cohort:{t} + id + flags | 5 min   | fieldsdef                          |
| POST /cohort/geographical-hierarchy                            | A           | cohort:{t} + body hash  | 5 min   | —                                  |
| GET /cohort/mycohorts/:userId                                  | A           | cohort:{t} + userId     | 5 min   | cohortmember:{t}                   |
| Cohort custom fields (getBulkCustomFieldDetails(...,'Cohort')) | B           | cfields:{cohortId}      | 1 h     | —                                  |

**Invalidation:** POST /cohort/create, PUT /cohort/update/:id (both also write FieldValues → bump cfields:{id}, userfilter), PATCH /cohort/updateStatus, DELETE /cohort/delete/:id → all bump cohort:{t} (the COHORT\_\* publish points, cohort.service.ts:455/714/1080).

### 2.1.4 cohortMembers module

| **Cached thing**                 | **Pattern**                 | **Namespace / key**           | **TTL** | **dependsOn**                                       |
|----------------------------------|-----------------------------|-------------------------------|---------|-----------------------------------------------------|
| GET /cohortmember/read/:cohortId | A                           | cohortmember:{t} + id + flags | 3 min   | fieldsdef, userlist:{t}                             |
| POST /cohortmember/list          | A                           | cohortmember:{t} + body hash  | 3 min   | fieldsdef, userlist:{t}                             |
| Member user-detail hydration     | reuses **ufields:{userId}** | —                             | —       | shared with user module — cross-module hit-rate win |

**Invalidation:** member create / update / delete / bulkCreate (cohortMembers.service.ts:585/792/853/1351) and cron assign-students (cron.service.ts:321) → bump cohortmember:{t}; membership changes also bump cohort:{t}? No — mycohorts declares dependsOn: cohortmember:{t} instead (rule 1.3.3).

### 2.1.5 Secondary modules (Phase 2)

- **tenant:** GET /tenant/read, POST /tenant/search → tenant (A, 1 h); bumped by tenant create/update/delete (no events — direct hooks).

- **forms:** GET /form/read → form:{tenantId} + (context, contextType) (A, 1 h); bumped by POST /form/create **and any fields-definition write** (§2.1.2).

- Later: locations, roles, privileges, academic years, role-permission map (see superseded spec for their tables — carried over unchanged when scheduled).

- **usertenant / userroles** (quick wins, ship with user module): GET /user-tenant/:userId → usertenant:{userId} (10 min); GET /rbac/usersRoles/:userId → userroles:{t}:{userId} (10 min); triggers already in the user matrix.

### 2.1.6 Rollout order

1.  CacheModule + platform plumbing (behind CACHE_ENABLED=false) + tests.

2.  ufields bulk hydration + getCoreColumnNames memo (pure add, no API shape change) → dev → QA.

3.  userlist response cache + userfilter + usertenant/userroles.

4.  cohort + cfields + cohortmember.

5.  Id-resolution refactor + user:{userId} core hydration (measure first — only if the thin query shows real gains).

6.  Phase 2 reference data (tenant, forms, fields definitions).

7.  Next services onboard by adding their own §2.x section here before writing code.

## 2.2 (Template) Next service

Copy §2.1's structure: namespace catalog → per-module tables (cached thing, pattern, key, TTL, dependsOn) → **invalidation matrix enumerating every write path** → rollout order. A service section merged into this doc is the prerequisite for its implementation PRs.
