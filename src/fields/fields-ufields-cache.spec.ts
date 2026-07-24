import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { FieldsService } from "./fields.service";
import { Fields } from "./entities/fields.entity";
import { FieldValues } from "./entities/fields-values.entity";
import { CacheService } from "../cache/cache.service";
import { CacheMetrics } from "../cache/cache.metrics";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "../cache/cache.constants";
import { CacheConfig } from "../cache/cache.config";
import { MemoryCacheVersionStore } from "../cache/stores/memory-version-store";
import { UserService } from "../user/user.service";

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

/** One FieldValues row per user, as the bulk SQL query would return it. */
function dbRow(itemId: string, value: string) {
  return {
    itemId,
    fieldId: `f-${itemId}`,
    label: "STATE",
    value: [value],
    type: "text",
    fieldParams: null,
    sourceDetails: null,
  };
}

async function buildFieldsService(cache: Cache, versionStore: any, config: CacheConfig) {
  const fieldsRepository = { query: jest.fn() };
  const moduleRef = await Test.createTestingModule({
    providers: [
      FieldsService,
      CacheService,
      CacheMetrics,
      { provide: getRepositoryToken(Fields), useValue: fieldsRepository },
      { provide: getRepositoryToken(FieldValues), useValue: { createQueryBuilder: jest.fn() } },
      { provide: CACHE_MANAGER, useValue: cache },
      { provide: CACHE_VERSION_STORE, useValue: versionStore },
      { provide: CACHE_CONFIG, useValue: config },
    ],
  }).compile();

  return {
    fieldsService: moduleRef.get(FieldsService),
    cacheService: moduleRef.get(CacheService),
    fieldsRepository,
  };
}

describe("ufields:{userId} cache (getBulkCustomFieldDetails)", () => {
  it("miss: first call queries the DB and returns grouped fields", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValue([dbRow("u1", "Goa"), dbRow("u2", "Pune")]);

    const result = await fieldsService.getBulkCustomFieldDetails(["u1", "u2"], "Users");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(1);
    expect(result["u1"][0].selectedValues).toEqual(["Goa"]);
    expect(result["u2"][0].selectedValues).toEqual(["Pune"]);
  });

  it("hit: second call for the same users never touches the DB", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValue([dbRow("u1", "Goa")]);

    await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    const second = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(1);
    expect(second["u1"][0].selectedValues).toEqual(["Goa"]);
  });

  it("partial miss: only uncached users go to the DB (bulk-hydration idiom)", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValueOnce([dbRow("u1", "Goa")]).mockResolvedValueOnce([dbRow("u2", "Pune")]);

    await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    const result = await fieldsService.getBulkCustomFieldDetails(["u1", "u2"], "Users");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(2);
    expect(fieldsRepository.query.mock.calls[1][1]).toEqual([["u2"]]); // only the missing id
    expect(result["u1"][0].selectedValues).toEqual(["Goa"]);
    expect(result["u2"][0].selectedValues).toEqual(["Pune"]);
  });

  it("write-then-fresh: invalidating ufields:{userId} makes the next read re-query the DB", async () => {
    const { fieldsService, cacheService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValueOnce([dbRow("u1", "Goa")]).mockResolvedValueOnce([dbRow("u1", "Delhi")]);

    const before = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    expect(before["u1"][0].selectedValues).toEqual(["Goa"]);

    // What every hooked write path does after its FieldValues write commits.
    await cacheService.invalidate("ufields:u1");

    const after = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    expect(after["u1"][0].selectedValues).toEqual(["Delhi"]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(2);
  });

  it("invalidating one user leaves other users' entries hot", async () => {
    const { fieldsService, cacheService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValueOnce([dbRow("u1", "Goa"), dbRow("u2", "Pune")]).mockResolvedValueOnce([dbRow("u1", "Delhi")]);

    await fieldsService.getBulkCustomFieldDetails(["u1", "u2"], "Users");
    await cacheService.invalidate("ufields:u1");
    await fieldsService.getBulkCustomFieldDetails(["u1", "u2"], "Users");

    expect(fieldsRepository.query.mock.calls[1][1]).toEqual([["u1"]]); // u2 still cached
  });

  it("users with no custom fields are NOT cached (no negative caching)", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValue([]); // user exists but has no field values

    const first = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    const second = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");

    expect(first["u1"]).toEqual([]);
    expect(second["u1"]).toEqual([]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(2); // empty result re-queried, never cached
  });

  it("redis-down passthrough: cache/version ops failing still returns DB data, no error thrown", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      redisDownCache(),
      redisDownVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValue([dbRow("u1", "Goa")]);

    const result = await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");

    expect(result["u1"][0].selectedValues).toEqual(["Goa"]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(1);
  });

  it("CACHE_ENABLED=false: pure pass-through, DB queried every time (ship-dark default)", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig({ enabled: false }),
    );
    fieldsRepository.query.mockResolvedValue([dbRow("u1", "Goa")]);

    await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");
    await fieldsService.getBulkCustomFieldDetails(["u1"], "Users");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(2);
  });

  it("Cohort items are cached under cfields as of rollout step 4 (was uncached in step 2)", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig(),
    );
    fieldsRepository.query.mockResolvedValue([dbRow("c1", "Batch A")]);

    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");
    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(1); // second call served from cfields
  });
});

describe("getCoreColumnNames memo (in-process, no Redis)", () => {
  it("computes column names once per process and reuses the memo", async () => {
    const getMetadata = jest.fn().mockReturnValue({
      columns: [{ propertyName: "userId" }, { propertyName: "username" }],
    });
    const fakeThis = { coreColumnNamesMemo: null, dataSource: { getMetadata } };

    const first = await UserService.prototype.getCoreColumnNames.call(fakeThis);
    const second = await UserService.prototype.getCoreColumnNames.call(fakeThis);

    expect(first).toEqual(["userId", "username"]);
    expect(second).toBe(first);
    expect(getMetadata).toHaveBeenCalledTimes(1);
  });
});
