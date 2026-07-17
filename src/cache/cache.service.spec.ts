import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Test } from "@nestjs/testing";
import { CacheService } from "./cache.service";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { CacheVersionStore } from "./interfaces/cache-version-store.interface";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";

function baseConfig(overrides: Partial<CacheConfig> = {}): CacheConfig {
  return {
    enabled: true,
    provider: "memory",
    keyPrefix: "ums",
    disabledNamespaces: new Set<string>(),
    opTimeoutMs: 150,
    cbFailures: 3,
    cbCooldownMs: 1000,
    ...overrides,
  };
}

/** Minimal in-memory stand-in for cache-manager's Cache interface, keyed exactly like the real thing. */
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
    del: async (key: string) => store.delete(key),
    mdel: async (keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return true;
    },
  } as unknown as Cache;
}

/** Always-fails collaborator, standing in for a Redis client that's down/timing out. */
function alwaysFailingCache(): Cache {
  return {
    get: async () => {
      throw new Error("ECONNREFUSED");
    },
    mget: async () => {
      throw new Error("ECONNREFUSED");
    },
    set: async () => {
      throw new Error("ECONNREFUSED");
    },
    mset: async () => {
      throw new Error("ECONNREFUSED");
    },
  } as unknown as Cache;
}

function alwaysFailingVersionStore(): CacheVersionStore {
  return {
    get: async () => {
      throw new Error("ECONNREFUSED");
    },
    mget: async () => {
      throw new Error("ECONNREFUSED");
    },
    incr: async () => {
      throw new Error("ECONNREFUSED");
    },
  };
}

async function buildService(
  cache: Cache,
  versionStore: CacheVersionStore,
  config: CacheConfig,
): Promise<CacheService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CacheService,
      { provide: CACHE_MANAGER, useValue: cache },
      { provide: CACHE_VERSION_STORE, useValue: versionStore },
      { provide: CACHE_CONFIG, useValue: config },
    ],
  }).compile();

  return moduleRef.get(CacheService);
}

describe("CacheService", () => {
  describe("getOrLoad", () => {
    it("is a cache miss on first read and calls the loader", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn().mockResolvedValue({ id: "u1", name: "Alice" });

      const result = await service.getOrLoad({
        namespace: "user:u1",
        key: "core",
        ttlSeconds: 60,
        loader,
      });

      expect(result).toEqual({ id: "u1", name: "Alice" });
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("is a cache hit on the second read and does not call the loader again", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn().mockResolvedValue({ id: "u1", name: "Alice" });
      const opts = { namespace: "user:u1", key: "core", ttlSeconds: 60, loader };

      await service.getOrLoad(opts);
      const second = await service.getOrLoad(opts);

      expect(second).toEqual({ id: "u1", name: "Alice" });
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("write-then-immediate-read is fresh: invalidate() changes what the next getOrLoad returns", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest
        .fn()
        .mockResolvedValueOnce({ id: "u1", name: "Alice" })
        .mockResolvedValueOnce({ id: "u1", name: "Alice (updated)" });
      const opts = { namespace: "user:u1", key: "core", ttlSeconds: 60, loader };

      const before = await service.getOrLoad(opts);
      expect(before).toEqual({ id: "u1", name: "Alice" });

      // Simulate: DB write commits, then the write path invalidates the namespace.
      await service.invalidate("user:u1");

      const after = await service.getOrLoad(opts);
      expect(after).toEqual({ id: "u1", name: "Alice (updated)" });
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("does not cache null/false/empty-array results (no negative caching)", async () => {
      const cache = fakeCache();
      const service = await buildService(cache, new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn().mockResolvedValue(null);

      await service.getOrLoad({ namespace: "user:missing", key: "core", ttlSeconds: 60, loader });
      await service.getOrLoad({ namespace: "user:missing", key: "core", ttlSeconds: 60, loader });

      expect(loader).toHaveBeenCalledTimes(2); // never served from cache
    });

    it("bypasses the cache entirely (pass-through) when CACHE_ENABLED is false", async () => {
      const cache = fakeCache();
      const setSpy = jest.spyOn(cache, "set");
      const service = await buildService(cache, new MemoryCacheVersionStore(), baseConfig({ enabled: false }));
      const loader = jest.fn().mockResolvedValue({ id: "u1" });

      await service.getOrLoad({ namespace: "user:u1", key: "core", ttlSeconds: 60, loader });
      await service.getOrLoad({ namespace: "user:u1", key: "core", ttlSeconds: 60, loader });

      expect(loader).toHaveBeenCalledTimes(2);
      expect(setSpy).not.toHaveBeenCalled();
    });

    it("bypasses a namespace listed in CACHE_DISABLED_NAMESPACES", async () => {
      const service = await buildService(
        fakeCache(),
        new MemoryCacheVersionStore(),
        baseConfig({ disabledNamespaces: new Set(["user"]) }),
      );
      const loader = jest.fn().mockResolvedValue({ id: "u1" });
      const opts = { namespace: "user:u1", key: "core", ttlSeconds: 60, loader };

      await service.getOrLoad(opts);
      await service.getOrLoad(opts);

      expect(loader).toHaveBeenCalledTimes(2);
    });

    it("Redis-down passthrough: op failures still resolve via the loader, no error reaches the caller", async () => {
      const service = await buildService(alwaysFailingCache(), alwaysFailingVersionStore(), baseConfig());
      const loader = jest.fn().mockResolvedValue({ id: "u1", name: "Alice" });

      const result = await service.getOrLoad({ namespace: "user:u1", key: "core", ttlSeconds: 60, loader });

      expect(result).toEqual({ id: "u1", name: "Alice" });
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it("Redis-down passthrough: invalidate() never throws even when every op fails", async () => {
      const service = await buildService(alwaysFailingCache(), alwaysFailingVersionStore(), baseConfig());
      await expect(service.invalidate("user:u1")).resolves.toBeUndefined();
    });

    it("opens the circuit breaker after cbFailures consecutive failures and stops attempting ops", async () => {
      const versionStore = alwaysFailingVersionStore();
      const mgetSpy = jest.spyOn(versionStore, "mget");
      const service = await buildService(fakeCache(), versionStore, baseConfig({ cbFailures: 2, cbCooldownMs: 10_000 }));
      const loader = jest.fn().mockResolvedValue({ id: "u1" });
      const opts = { namespace: "user:u1", key: "core", ttlSeconds: 60, loader };

      await service.getOrLoad(opts); // failure 1
      await service.getOrLoad(opts); // failure 2 -> breaker opens
      mgetSpy.mockClear();

      await service.getOrLoad(opts); // breaker open: should not even attempt mget

      expect(mgetSpy).not.toHaveBeenCalled();
      expect(loader).toHaveBeenCalledTimes(3);
    });

    it("dependsOn: a bump to a joined namespace invalidates the read even though the read's own namespace didn't change", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest
        .fn()
        .mockResolvedValueOnce({ list: ["a"] })
        .mockResolvedValueOnce({ list: ["a", "b"] });
      const opts = {
        namespace: "cohort:t1",
        key: "search-hash",
        dependsOn: ["fieldsdef"],
        ttlSeconds: 60,
        loader,
      };

      const before = await service.getOrLoad(opts);
      expect(before).toEqual({ list: ["a"] });

      await service.invalidate("fieldsdef");

      const after = await service.getOrLoad(opts);
      expect(after).toEqual({ list: ["a", "b"] });
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe("bulkGetOrLoad", () => {
    it("hydrates all ids from the loader on first call, then fully from cache on the second", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn(async (missingIds: string[]) => {
        const map = new Map<string, { id: string }>();
        missingIds.forEach((id) => map.set(id, { id }));
        return map;
      });
      const opts = {
        ids: ["u1", "u2", "u3"],
        namespaceFor: (id: string) => `ufields:${id}`,
        ttlSeconds: 60,
        loader,
      };

      const first = await service.bulkGetOrLoad(opts);
      expect([...first.keys()].sort()).toEqual(["u1", "u2", "u3"]);
      expect(loader).toHaveBeenCalledWith(["u1", "u2", "u3"]);

      const second = await service.bulkGetOrLoad(opts);
      expect([...second.keys()].sort()).toEqual(["u1", "u2", "u3"]);
      expect(loader).toHaveBeenCalledTimes(1); // second call fully served from cache
    });

    it("loads only the ids that miss, backfilling the rest and merging with cache hits", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn(async (missingIds: string[]) => {
        const map = new Map<string, { id: string }>();
        missingIds.forEach((id) => map.set(id, { id }));
        return map;
      });
      const namespaceFor = (id: string) => `ufields:${id}`;

      await service.bulkGetOrLoad({ ids: ["u1", "u2"], namespaceFor, ttlSeconds: 60, loader });
      loader.mockClear();

      const result = await service.bulkGetOrLoad({ ids: ["u1", "u2", "u3"], namespaceFor, ttlSeconds: 60, loader });

      expect(loader).toHaveBeenCalledWith(["u3"]); // only the new id is fetched
      expect([...result.keys()].sort()).toEqual(["u1", "u2", "u3"]);
    });

    it("invalidating one id's namespace only forces a reload for that id, not its siblings", async () => {
      const service = await buildService(fakeCache(), new MemoryCacheVersionStore(), baseConfig());
      const loader = jest.fn(async (missingIds: string[]) => {
        const map = new Map<string, { id: string; v: number }>();
        missingIds.forEach((id) => map.set(id, { id, v: 1 }));
        return map;
      });
      const namespaceFor = (id: string) => `ufields:${id}`;
      const opts = { ids: ["u1", "u2"], namespaceFor, ttlSeconds: 60, loader };

      await service.bulkGetOrLoad(opts);
      await service.invalidate("ufields:u1");
      loader.mockClear();

      await service.bulkGetOrLoad(opts);

      expect(loader).toHaveBeenCalledWith(["u1"]); // u2 stayed cached
    });

    it("Redis-down passthrough: bulkGetOrLoad still resolves every id via the loader", async () => {
      const service = await buildService(alwaysFailingCache(), alwaysFailingVersionStore(), baseConfig());
      const loader = jest.fn(async (missingIds: string[]) => {
        const map = new Map<string, { id: string }>();
        missingIds.forEach((id) => map.set(id, { id }));
        return map;
      });

      const result = await service.bulkGetOrLoad({
        ids: ["u1", "u2"],
        namespaceFor: (id) => `ufields:${id}`,
        ttlSeconds: 60,
        loader,
      });

      expect([...result.keys()].sort()).toEqual(["u1", "u2"]);
      expect(loader).toHaveBeenCalledWith(["u1", "u2"]);
    });
  });
});
