import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CacheService } from "./cache.service";
import { CacheMetrics } from "./cache.metrics";
import { CacheMetricsReporter } from "./cache-metrics.reporter";
import { CacheHealthIndicator } from "./cache-health.indicator";
import { CACHE_CONFIG, CACHE_REDIS_HANDLE, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";
import { FieldsService } from "../fields/fields.service";
import { Fields } from "../fields/entities/fields.entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { TenantService } from "../tenant/tenant.service";
import { Tenant } from "../tenant/entities/tenent.entity";
import { FormsService } from "../forms/forms.service";
import { LoggerUtil } from "../common/logger/LoggerUtil";

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

async function buildCacheService(cache: Cache, versionStore: any, config: CacheConfig) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CacheService,
      CacheMetrics,
      { provide: CACHE_MANAGER, useValue: cache },
      { provide: CACHE_VERSION_STORE, useValue: versionStore },
      { provide: CACHE_CONFIG, useValue: config },
    ],
  }).compile();
  return {
    cacheService: moduleRef.get(CacheService),
    metrics: moduleRef.get(CacheMetrics),
  };
}

function resMock() {
  const out: any = { statusCode: 0, body: null, headersSent: false };
  out.status = (code: number) => {
    out.statusCode = code;
    return out;
  };
  out.json = (data: any) => {
    out.body = data;
    out.headersSent = true;
    return out;
  };
  return out;
}

async function buildFieldsService(cache: Cache, versionStore: any, config = cacheConfig()) {
  const fieldsRepository = { query: jest.fn(), metadata: { columns: [{ propertyName: "name" }] }, findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
  const moduleRef = await Test.createTestingModule({
    providers: [
      FieldsService,
      CacheService,
      CacheMetrics,
      { provide: getRepositoryToken(Fields), useValue: fieldsRepository },
      { provide: getRepositoryToken(FieldValues), useValue: { query: jest.fn() } },
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

describe("fields:{tenantId} definition cache (§2.1.2 phase 2)", () => {
  it("miss then hit: POST /fields/search is served from cache the second time", async () => {
    const { fieldsService, fieldsRepository } = await buildFieldsService(fakeCache(), new MemoryCacheVersionStore());
    jest.spyOn(fieldsService as any, "getFieldData").mockResolvedValue([{ fieldId: "f1", name: "state" }]);

    const r1 = resMock();
    await fieldsService.searchFields(TENANT, {} as any, { limit: 10, offset: 0 } as any, r1);
    const r2 = resMock();
    await fieldsService.searchFields(TENANT, {} as any, { limit: 10, offset: 0 } as any, r2);

    expect(r1.body.result).toEqual([{ fieldId: "f1", name: "state" }]);
    expect(r2.body.result).toEqual([{ fieldId: "f1", name: "state" }]);
    expect((fieldsService as any).getFieldData).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: a field-definition write bumps fields:{t} AND fieldsdef together", async () => {
    const { fieldsService, cacheService } = await buildFieldsService(fakeCache(), new MemoryCacheVersionStore());
    const invalidateSpy = jest.spyOn(cacheService, "invalidate");

    await (fieldsService as any).invalidateFieldDefinitionCaches(TENANT);

    const bumped = invalidateSpy.mock.calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    expect(bumped).toContain("fieldsdef");
    expect(bumped).toContain(`fields:${TENANT}`);
    expect(bumped).toContain(`form:${TENANT}`); // §2.1.5 forms embed definitions
  });

  it("a definition write makes the next /fields/search re-query", async () => {
    const { fieldsService } = await buildFieldsService(fakeCache(), new MemoryCacheVersionStore());
    const getFieldData = jest
      .spyOn(fieldsService as any, "getFieldData")
      .mockResolvedValueOnce([{ fieldId: "f1" }])
      .mockResolvedValueOnce([{ fieldId: "f1" }, { fieldId: "f2" }]);

    await fieldsService.searchFields(TENANT, {} as any, {} as any, resMock());
    await (fieldsService as any).invalidateFieldDefinitionCaches(TENANT);
    const r = resMock();
    await fieldsService.searchFields(TENANT, {} as any, {} as any, r);

    expect(r.body.result).toHaveLength(2);
    expect(getFieldData).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: /fields/search still responds from the DB", async () => {
    const { fieldsService } = await buildFieldsService(redisDownCache(), redisDownVersionStore());
    jest.spyOn(fieldsService as any, "getFieldData").mockResolvedValue([{ fieldId: "f1" }]);

    const r = resMock();
    await fieldsService.searchFields(TENANT, {} as any, {} as any, r);

    expect(r.statusCode).toBe(200);
    expect(r.body.result).toEqual([{ fieldId: "f1" }]);
  });

  it("a not-found search (404) is never cached", async () => {
    const { fieldsService } = await buildFieldsService(fakeCache(), new MemoryCacheVersionStore());
    const getFieldData = jest.spyOn(fieldsService as any, "getFieldData").mockResolvedValue([]);

    const r1 = resMock();
    await fieldsService.searchFields(TENANT, {} as any, {} as any, r1);
    const r2 = resMock();
    await fieldsService.searchFields(TENANT, {} as any, {} as any, r2);

    expect(r1.statusCode).toBe(404);
    expect(r2.statusCode).toBe(404);
    expect(getFieldData).toHaveBeenCalledTimes(2);
  });
});

describe("tenant cache (§2.1.5 phase 2)", () => {
  async function build(cache: Cache, versionStore: any, config = cacheConfig()) {
    const tenantRepository = { find: jest.fn(), findAndCount: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn(), findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantService,
        CacheService,
        CacheMetrics,
        { provide: getRepositoryToken(Tenant), useValue: tenantRepository },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: CACHE_VERSION_STORE, useValue: versionStore },
        { provide: CACHE_CONFIG, useValue: config },
      ],
    }).compile();
    return {
      tenantService: moduleRef.get(TenantService),
      cacheService: moduleRef.get(CacheService),
      tenantRepository,
    };
  }

  it("miss then hit: GET /tenant/read served from cache on the second call", async () => {
    const { tenantService, tenantRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    tenantRepository.find.mockResolvedValue([{ tenantId: TENANT, name: "T1", parentId: null }]);

    await tenantService.getTenants({} as any, resMock());
    const r2 = resMock();
    await tenantService.getTenants({} as any, r2);

    expect(r2.statusCode).toBe(200);
    expect(tenantRepository.find).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: a tenant write bumps the tenant namespace (no Kafka event exists)", async () => {
    const { tenantService, cacheService, tenantRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    tenantRepository.find
      .mockResolvedValueOnce([{ tenantId: TENANT, name: "T1", parentId: null }])
      .mockResolvedValueOnce([{ tenantId: TENANT, name: "T1-renamed", parentId: null }]);

    await tenantService.getTenants({} as any, resMock());
    await cacheService.invalidate("tenant"); // what create/update/delete now do
    await tenantService.getTenants({} as any, resMock());

    expect(tenantRepository.find).toHaveBeenCalledTimes(2);
  });

  it("empty tenant list (404) is never cached", async () => {
    const { tenantService, tenantRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    tenantRepository.find.mockResolvedValue([]);

    const r1 = resMock();
    await tenantService.getTenants({} as any, r1);
    const r2 = resMock();
    await tenantService.getTenants({} as any, r2);

    expect(r1.statusCode).toBe(404);
    expect(tenantRepository.find).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: tenant read still responds", async () => {
    const { tenantService, tenantRepository } = await build(redisDownCache(), redisDownVersionStore());
    tenantRepository.find.mockResolvedValue([{ tenantId: TENANT, name: "T1", parentId: null }]);

    const r = resMock();
    await tenantService.getTenants({} as any, r);

    expect(r.statusCode).toBe(200);
  });
});

describe("form:{tenantId} cache (§2.1.5 phase 2)", () => {
  function fakeForms(cacheService: CacheService, payloads: any[]) {
    let i = 0;
    return {
      cacheService,
      getFormPayload: jest.fn(async () => payloads[Math.min(i++, payloads.length - 1)]),
      getForm: FormsService.prototype.getForm,
    } as any;
  }

  it("miss then hit: GET /form/read cached per (context, contextType)", async () => {
    const { cacheService } = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeForms(cacheService, [{ formid: "f1", fields: [] }]);
    const req = { tenantId: TENANT, context: "USERS", contextType: "TEACHER" };

    await svc.getForm(req, resMock());
    const r2 = resMock();
    await svc.getForm(req, r2);

    expect(r2.body.result).toEqual({ formid: "f1", fields: [] });
    expect(svc.getFormPayload).toHaveBeenCalledTimes(1);
  });

  it("a different contextType is a separate cache entry", async () => {
    const { cacheService } = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeForms(cacheService, [{ formid: "f1" }, { formid: "f2" }]);

    await svc.getForm({ tenantId: TENANT, context: "USERS", contextType: "TEACHER" }, resMock());
    await svc.getForm({ tenantId: TENANT, context: "USERS", contextType: "STUDENT" }, resMock());

    expect(svc.getFormPayload).toHaveBeenCalledTimes(2);
  });

  it("a field-DEFINITION change invalidates the form read (forms embed definitions)", async () => {
    const { cacheService } = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeForms(cacheService, [{ formid: "f1" }, { formid: "f1-updated" }]);
    const req = { tenantId: TENANT, context: "USERS", contextType: "TEACHER" };

    await svc.getForm(req, resMock());
    await cacheService.invalidate("fieldsdef"); // POST /fields/create etc.
    const r = resMock();
    await svc.getForm(req, r);

    expect(r.body.result).toEqual({ formid: "f1-updated" });
    expect(svc.getFormPayload).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: form read still responds", async () => {
    const { cacheService } = await buildCacheService(redisDownCache(), redisDownVersionStore(), cacheConfig());
    const svc = fakeForms(cacheService, [{ formid: "f1" }]);

    const r = resMock();
    await svc.getForm({ tenantId: TENANT, context: "USERS" }, r);

    expect(r.body.result).toEqual({ formid: "f1" });
  });
});

describe("§1.6 observability", () => {
  it("records per-namespace hit / miss counters", async () => {
    const { cacheService, metrics } = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const load = () => cacheService.getOrLoad({ namespace: `user:u1`, key: "k", ttlSeconds: 60, loader: async () => ({ v: 1 }) });

    await load(); // miss
    await load(); // hit
    await load(); // hit

    const snap = metrics.snapshot();
    expect(snap["user"].miss).toBe(1);
    expect(snap["user"].hit).toBe(2);
    expect(snap["user"].hitRate).toBe("66.7%");
  });

  it("records error counters when Redis is down, and bypass once the circuit opens", async () => {
    const { cacheService, metrics } = await buildCacheService(
      redisDownCache(),
      redisDownVersionStore(),
      cacheConfig({ cbFailures: 2, cbCooldownMs: 10_000 }),
    );
    const load = () => cacheService.getOrLoad({ namespace: "tenant", key: "k", ttlSeconds: 60, loader: async () => ({ v: 1 }) });

    await load(); // failure 1 -> error
    await load(); // failure 2 -> error, breaker opens
    await load(); // breaker open -> bypass

    const snap = metrics.snapshot();
    expect(snap["tenant"].error).toBeGreaterThanOrEqual(2);
    expect(snap["tenant"].bypass).toBeGreaterThanOrEqual(1);
  });

  it("logs a debug line on every INCR with namespace and caller", async () => {
    const { cacheService } = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const logSpy = jest.spyOn(LoggerUtil, "log").mockImplementation(() => undefined as any);

    await cacheService.invalidate("cohort:t1");

    const line = logSpy.mock.calls.map((c) => String(c[0])).find((m) => m.includes("cache INCR"));
    expect(line).toContain("ns=cohort:t1");
    expect(line).toContain("caller=");
    logSpy.mockRestore();
  });

  it("the periodic reporter logs a snapshot only when there is activity", async () => {
    const metrics = new CacheMetrics();
    const reporter = new CacheMetricsReporter(metrics, cacheConfig());
    const logSpy = jest.spyOn(LoggerUtil, "log").mockImplementation(() => undefined as any);

    reporter.report();
    expect(logSpy).not.toHaveBeenCalled(); // nothing recorded yet

    metrics.record("ufields:u1", "hit");
    reporter.report();

    expect(String(logSpy.mock.calls[0][0])).toContain("cache metrics");
    expect(String(logSpy.mock.calls[0][0])).toContain("ufields");
    logSpy.mockRestore();
  });
});

describe("§1.5 rule 5 — /health reports Redis informationally", () => {
  async function indicator(config: CacheConfig, redisHandle?: any) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CacheHealthIndicator,
        CacheMetrics,
        { provide: CACHE_CONFIG, useValue: config },
        { provide: CACHE_REDIS_HANDLE, useValue: redisHandle },
      ],
    }).compile();
    return moduleRef.get(CacheHealthIndicator);
  }

  it("reports disabled when the master switch is off, and never throws", async () => {
    const health = await indicator(cacheConfig({ enabled: false }));
    await expect(health.check()).resolves.toMatchObject({ enabled: false, redis: "disabled" });
  });

  it("reports unreachable (not an exception) when Redis is down", async () => {
    const brokenHandle = {
      getClient: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const health = await indicator(cacheConfig({ provider: "redis" }), brokenHandle);

    await expect(health.check()).resolves.toMatchObject({ redis: "unreachable" });
  });

  it("reports ok when Redis answers PING", async () => {
    const handle = { getClient: async () => ({ ping: async () => "PONG" }) };
    const health = await indicator(cacheConfig({ provider: "redis" }), handle);

    await expect(health.check()).resolves.toMatchObject({ redis: "ok" });
  });

  it("surfaces the disabled-namespace list for operators", async () => {
    const health = await indicator(cacheConfig({ disabledNamespaces: new Set(["userlist", "cohort"]) }));
    const result = await health.check();
    expect(result.disabledNamespaces.sort()).toEqual(["cohort", "userlist"]);
  });
});

describe("CACHE_DISABLED_NAMESPACES works end-to-end (config, not code)", () => {
  it("a disabled namespace bypasses the cache while its siblings keep caching", async () => {
    const { cacheService } = await buildCacheService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig({ disabledNamespaces: new Set(["userlist"]) }),
    );

    let userlistLoads = 0;
    let cohortLoads = 0;
    const userlist = () =>
      cacheService.getOrLoad({ namespace: `userlist:${TENANT}`, key: "k", ttlSeconds: 60, loader: async () => ({ n: ++userlistLoads }) });
    const cohort = () =>
      cacheService.getOrLoad({ namespace: `cohort:${TENANT}`, key: "k", ttlSeconds: 60, loader: async () => ({ n: ++cohortLoads }) });

    await userlist();
    await userlist();
    await cohort();
    await cohort();

    expect(userlistLoads).toBe(2); // bypassed by config
    expect(cohortLoads).toBe(1); // still cached
  });

  it("disabling by family name covers every per-tenant/per-id namespace under it", async () => {
    const { cacheService } = await buildCacheService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig({ disabledNamespaces: new Set(["ufields"]) }),
    );

    let loads = 0;
    const read = (id: string) =>
      cacheService.getOrLoad({ namespace: `ufields:${id}`, key: "data", ttlSeconds: 60, loader: async () => ({ n: ++loads }) });

    await read("u1");
    await read("u1");
    await read("u2");

    expect(loads).toBe(3); // family-wide bypass, no entry ever served
  });

  it("an exact namespace entry disables only that one instance", async () => {
    const { cacheService } = await buildCacheService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig({ disabledNamespaces: new Set([`cohort:${TENANT}`]) }),
    );

    let disabledLoads = 0;
    let otherLoads = 0;
    const disabled = () =>
      cacheService.getOrLoad({ namespace: `cohort:${TENANT}`, key: "k", ttlSeconds: 60, loader: async () => ({ n: ++disabledLoads }) });
    const other = () =>
      cacheService.getOrLoad({ namespace: "cohort:other-tenant", key: "k", ttlSeconds: 60, loader: async () => ({ n: ++otherLoads }) });

    await disabled();
    await disabled();
    await other();
    await other();

    expect(disabledLoads).toBe(2); // bypassed
    expect(otherLoads).toBe(1); // cached
  });

  it("bulkGetOrLoad honours a disabled namespace too", async () => {
    const { cacheService } = await buildCacheService(
      fakeCache(),
      new MemoryCacheVersionStore(),
      cacheConfig({ disabledNamespaces: new Set(["ufields"]) }),
    );

    const loader = jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { id }])));
    const run = () =>
      cacheService.bulkGetOrLoad({ ids: ["u1", "u2"], namespaceFor: (id) => `ufields:${id}`, ttlSeconds: 60, loader });

    await run();
    await run();

    expect(loader).toHaveBeenCalledTimes(2); // never served from cache
    expect(loader).toHaveBeenLastCalledWith(["u1", "u2"]);
  });
});
