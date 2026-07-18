import { Test } from "@nestjs/testing";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CacheService } from "./cache.service";
import { CacheMetrics } from "./cache.metrics";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";
import { UserService } from "../user/user.service";

const USER = "22222222-2222-4222-8222-222222222222";
const TENANT = "11111111-1111-4111-8111-111111111111";

function cacheConfig(overrides: Partial<CacheConfig> = {}): CacheConfig {
  return {
    enabled: true,
    provider: "memory",
    keyPrefix: "ums",
    disabledNamespaces: new Set<string>(),
    opTimeoutMs: 150,
    cbFailures: 5,
    cbCooldownMs: 30000,
    metricsIntervalMs: 60000,
    ...overrides,
  };
}

function fakeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    mget: async (keys: string[]) => keys.map((k) => (store.has(k) ? store.get(k) : null)),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return value;
    },
    mset: async (entries: Array<{ key: string; value: unknown }>) => {
      entries.forEach((e) => store.set(e.key, e.value));
      return entries;
    },
  } as unknown as Cache;
}

function redisDownCache(): Cache {
  const fail = async () => {
    throw new Error("ECONNREFUSED");
  };
  return { get: fail, mget: fail, set: fail, mset: fail } as unknown as Cache;
}

function redisDownVersionStore() {
  const fail = async () => {
    throw new Error("ECONNREFUSED");
  };
  return { get: fail, mget: fail, incr: fail };
}

async function buildCacheService(cache: Cache, versionStore: any, config: CacheConfig): Promise<CacheService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CacheService,
      CacheMetrics,
      { provide: CACHE_MANAGER, useValue: cache },
      { provide: CACHE_VERSION_STORE, useValue: versionStore },
      { provide: CACHE_CONFIG, useValue: config },
    ],
  }).compile();
  return moduleRef.get(CacheService);
}

/**
 * Exercises the real getCachedUserCoreRow against a fake `this` — the same
 * two fetches the endpoint already performed, now behind user:{userId}.
 */
function fakeUserService(cacheService: CacheService, details: any[], roles: any[] = []) {
  let d = 0;
  let r = 0;
  return {
    cacheService,
    findUserDetails: jest.fn(async () => details[Math.min(d++, details.length - 1)]),
    findUserRoles: jest.fn(async () => roles[Math.min(r++, roles.length - 1)] ?? null),
    getCachedUserCoreRow: (UserService.prototype as any).getCachedUserCoreRow,
  } as any;
}

const row = (name: string) => ({ userId: USER, name, tenantData: [{ tenantId: TENANT }] });

describe("user:{userId} core-row cache (§2.1.1 rows 4/6)", () => {
  it("miss then hit: second read is served from cache, no DB round-trips", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice")], [{ title: "LEARNER" }]);

    const first = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    const second = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(first[0].name).toBe("Alice");
    expect(second[0].name).toBe("Alice");
    expect(second[1]).toEqual({ title: "LEARNER" });
    expect(svc.findUserDetails).toHaveBeenCalledTimes(1);
    expect(svc.findUserRoles).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: bumping user:{id} makes the next read re-fetch", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice"), row("Alice Updated")], [{ title: "LEARNER" }]);

    const before = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    await cacheService.invalidate(`user:${USER}`); // PATCH /update, role/tenant writes, delete
    const after = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(before[0].name).toBe("Alice");
    expect(after[0].name).toBe("Alice Updated");
    expect(svc.findUserDetails).toHaveBeenCalledTimes(2);
  });

  it("dependsOn ufields: a custom-field write refreshes the cached core row (row 6)", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice"), row("Alice v2")], [{ title: "LEARNER" }]);

    await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    await cacheService.invalidate(`ufields:${USER}`); // POST /fields/values/create
    const after = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(after[0].name).toBe("Alice v2");
    expect(svc.findUserDetails).toHaveBeenCalledTimes(2);
  });

  it("role change invalidates the cached row, which carries role/tenantStatus", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice")], [{ title: "LEARNER" }, { title: "TEACHER" }]);

    const before = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    expect(before[1]).toEqual({ title: "LEARNER" });

    await cacheService.invalidate(`user:${USER}`); // assign-role create/delete/bulkUpdate

    const after = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    expect(after[1]).toEqual({ title: "TEACHER" });
  });

  it("per-tenant isolation: the same user under another tenant is a separate entry", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice")], [{ title: "LEARNER" }, { title: "ADMIN" }]);

    await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    await svc.getCachedUserCoreRow({ userId: USER, tenantId: "33333333-3333-4333-8333-333333333333" });

    expect(svc.findUserRoles).toHaveBeenCalledTimes(2); // not cross-served
  });

  it("a missing user (findUserDetails returns false) is never cached", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [false], [null]);

    const first = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    const second = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(first[0]).toBe(false);
    expect(second[0]).toBe(false);
    expect(svc.findUserDetails).toHaveBeenCalledTimes(2); // re-read every time
  });

  it("redis-down passthrough: the read still resolves from the DB, no error surfaces", async () => {
    const cacheService = await buildCacheService(redisDownCache(), redisDownVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [row("Alice")], [{ title: "LEARNER" }]);

    const result = await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(result[0].name).toBe("Alice");
    expect(result[1]).toEqual({ title: "LEARNER" });
  });

  it("CACHE_ENABLED=false: pure pass-through, both fetches run every time", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig({ enabled: false }));
    const svc = fakeUserService(cacheService, [row("Alice")], [{ title: "LEARNER" }]);

    await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });
    await svc.getCachedUserCoreRow({ userId: USER, tenantId: TENANT });

    expect(svc.findUserDetails).toHaveBeenCalledTimes(2);
  });
});
