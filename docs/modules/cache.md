# Cache Module

## Module Overview

The Cache module (`src/cache`) is a global, optional caching layer in front of the database. It uses versioned namespaces: every cached entry embeds the current version of its namespace, and a write invalidates by bumping that version (`INCR`), never by deleting keys. Redis is the shared store in QA/prod; an in-memory store is used locally. Any Redis problem degrades to a direct database read, never to an error or stale data.

The design rationale, rules and rollout plan live in [docs/CACHING_STRATEGY.md](../CACHING_STRATEGY.md); this page summarises what the code does today and does not repeat that document.

**Purpose**: Reduce latency and DB load on read-heavy APIs while guaranteeing the next read after a write is fresh across all pods.

**Key Entities**: None (no DB tables). Redis keys only.

**Dependencies**:
- `@nestjs/cache-manager`, `cache-manager` v6 + `keyv`, `@keyv/redis`
- `ConfigModule`
- `LoggerUtil`

**Exports** (module is `@Global`): `CacheService`, `CacheMetrics`, `CacheHealthIndicator`.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `CACHE_ENABLED` | `false` | Master switch. `false` means no Redis connection is opened and every call is a pass-through. |
| `CACHE_PROVIDER` | `memory` | `memory` or `redis` (anything else resolves to `memory`) |
| `REDIS_URL` | none | Required for `redis`. If provider is `redis` and this is unset, caching is forced off and an error is logged. |
| `CACHE_KEY_PREFIX` | `ums` | Prefix of all keys |
| `CACHE_DISABLED_NAMESPACES` | empty | Comma-separated namespace names or families (text before the first `:`) to bypass, e.g. `form,fields` |
| `CACHE_OP_TIMEOUT_MS` | `150` | Per-operation timeout |
| `CACHE_CB_FAILURES` | `5` | Consecutive failures before the circuit opens |
| `CACHE_CB_COOLDOWN_MS` | `30000` | How long the circuit stays open |

## CacheService API

- `getOrLoad({ namespace, key, dependsOn?, ttlSeconds, loader })` - read-through. Resolves namespace versions first, tries the versioned key, otherwise runs `loader()` and stores the result. `dependsOn` namespaces have their versions embedded in the key, so bumping any of them invalidates this entry.
- `bulkGetOrLoad({ ids, namespaceFor, keyFor?, dependsOn?, ttlSeconds, loader })` - per-id hydration: one `MGET` for versions, one for values, `loader(missingIds)` only for misses, then `MSET` backfill.
- `invalidate(namespace | namespace[])` - `INCR` each namespace version. Callers invoke it only after the DB write has committed. Logs `cache INCR ns=... v=... caller=...`.
- `getMetricsSnapshot()` - per-family counters.
- `hashCacheKey(value)` (`cache-key.util.ts`) - SHA-256 over JSON with keys sorted at every depth, used to build request-body keys.

Key shapes: version counter `{prefix}:v:{namespace}`; entry `{prefix}:{namespace}:v{N}:{key}[:{dep}v{M}...]`.

Never cached: `null`, `undefined`, `false`, empty arrays (no negative caching).

**Resilience**: each Redis operation has a timeout; any failure is treated as a miss. After `CACHE_CB_FAILURES` consecutive failures the circuit opens and all calls bypass Redis for `CACHE_CB_COOLDOWN_MS`. Startup runs a `PING` and only logs `Redis connected` / `Redis not connected`; the app always boots.

**Metrics**: `CacheMetrics` keeps in-process hit / miss / error / bypass counters per namespace family and `hitRate`. They are exposed through `GET /health` (`result.cache.namespaces`); there is no periodic metrics logger in the code.

## Namespaces in use

Verified against `getOrLoad` / `bulkGetOrLoad` / `invalidate` call sites.

| Namespace | Cached in | TTL | dependsOn | Invalidated by |
|---|---|---|---|---|
| `userlist:{tenantId}` | `user.service` (user list/search) | 3 min | - | user create/update/delete, cohort member writes, role assign/delete/update, user-tenant create/status update, cron assignment |
| `user:{userId}` | `user.service` (single-user read) | 15 min | `ufields:{userId}` | user update/delete, role changes, user-tenant changes, SSO field sync |
| `ufields:{userId}` / `cfields:{id}` | `fields.service` bulk custom-field hydration | 1 h | `fieldsdef` | custom-field value writes/deletes, user update, SSO |
| `userfilter` | `fields.service` (custom-field filter results) | 5 min | - | field value writes, user create/update/delete, SSO |
| `userroles:{userId}` | `assign-role.service` | 10 min | - | role assign / delete / bulk update |
| `usertenant:{userId}` | `user-tenant-mapping.service` | 10 min | - | user-tenant create / status update |
| `cohort:{tenantId}` | `cohort.service` (search, hierarchy, my cohorts) | 5 min | `fieldsdef`; my-cohorts also `cohortmember:{tenantId}` | cohort create / update / status / delete (delete also bumps `cohortmember:{tenantId}`) |
| `cohortmember:{tenantId}` | `cohortMembers.service` (read, list) | 3 min | `fieldsdef`, `userlist:{tenantId}` | member create / update / delete / bulk, cron auto-assign |
| `tenant` | `tenant.service` (read, search) | 1 h | - | tenant create / update / delete |
| `form:{tenantId or global}` | `forms.service` | 1 h | `fieldsdef` | form create, field definition writes |
| `fields:{tenantId or global}` | `fields.service` (definitions, form fields, options) | 1 h | `fieldsdef` | field create/update/option delete |
| `fieldsdef` | epoch counter only | - | - | any field definition change (also bumps `fields:global`, `form:global`, tenant `fields`/`form`); invalidates every `ufields`/`cfields`/`cohort`/`form` read at once |

**Example**: `POST /cohort/search` for tenant `T1` is stored as `ums:cohort:T1:v3:<sha256(body)>:fieldsdefv7`. A cohort update runs `invalidate("cohort:T1")`, making the key `...:v4:...`; the old entry is never read again and expires by TTL. A field definition edit bumps `fieldsdef` to `v8`, which also makes this entry unreachable without touching the cohort namespace.

## Health

`GET /health` (see [common.md](./common.md#health)) includes `CacheHealthIndicator.check()`: `enabled`, `provider`, `redis` (`ok` / `unreachable` / `not-configured` / `disabled`), `disabledNamespaces`, `namespaces` (metrics). Redis state never makes the health check fail.

## Common Issues & Solutions

### Issue: Data looks stale after a write
**Solution**: Confirm the write path calls `cacheService.invalidate` for the namespace the read uses, after commit. A new read joining other entities must declare them in `dependsOn`.

### Issue: Cache is not used in an environment
**Solution**: Check `CACHE_ENABLED=true`; with `CACHE_PROVIDER=redis` ensure `REDIS_URL` is set (otherwise caching is silently disabled with an error log). Check `/health` `result.cache`.

### Issue: One cache misbehaves
**Solution**: Add its namespace or family to `CACHE_DISABLED_NAMESPACES` and restart; no code change needed.

### Common Mistakes to Avoid
1. Invalidating before the DB write commits
2. Caching results that can be empty/false and expecting them to be stored
3. Adding a cached read without listing every write path that changes its data
