# Caching Rules

Source of truth: [`caching-strategy.md`](../../caching-strategy.md) (repo root — the
doc's own header says it belongs at `docs/caching-strategy.md`; it hasn't been moved
yet). Read it in full before touching any caching code — this file is a pointer plus
hard constraints, not a substitute for the spec.

## Non-negotiables

1. **CacheService only.** Every cached read/write goes through `CacheService`.
   Application code never imports a Redis/Keyv client directly — no
   `cache-manager`, `@keyv/redis`, or raw Redis client outside that module.

2. **INCR-only invalidation, after commit.** Invalidation bumps a namespace's
   version counter (`INCR`) — never `DEL`. The INCR runs only after the DB
   write has committed, never before and never on a failed write. This is
   what makes cache-aside race-safe (see §1.3 "stale-write race").

3. **No namespace without a written invalidation matrix.** Before a namespace
   ships, every write path that touches its underlying data must be
   enumerated in `caching-strategy.md` (Part 2, per-module table), matching
   the format of the existing `user:{userId}` / `ufields:{userId}` matrices.
   No matrix entry, no cache.

4. **No negative caching.** Never cache `null`, empty, or `false` results —
   avoids "stale empty" after a create.

5. **New namespaces ship dark.** Every new namespace goes out behind
   `CACHE_ENABLED=false` and is enabled explicitly per environment
   (dev → QA → prod), never on by default in the same PR that introduces it.

When in doubt about pattern (A/B/C/D), key shape, TTL, or dependsOn for a
given namespace, check the namespace catalog and per-module tables in
`caching-strategy.md` §2.1 first — don't improvise a new shape.
