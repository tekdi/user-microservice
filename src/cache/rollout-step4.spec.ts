import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CacheService } from "./cache.service";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";
import { FieldsService } from "../fields/fields.service";
import { Fields } from "../fields/entities/fields.entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { CohortService } from "../cohort/cohort.service";
import { CohortMembersService } from "../cohortMembers/cohortMembers.service";

const TENANT = "11111111-1111-4111-8111-111111111111";
const AY = "99999999-9999-4999-8999-999999999999";

function cacheConfig(overrides: Partial<CacheConfig> = {}): CacheConfig {
  return {
    enabled: true,
    provider: "memory",
    keyPrefix: "ums",
    disabledNamespaces: new Set<string>(),
    opTimeoutMs: 150,
    cbFailures: 5,
    cbCooldownMs: 30000,
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
      { provide: CACHE_MANAGER, useValue: cache },
      { provide: CACHE_VERSION_STORE, useValue: versionStore },
      { provide: CACHE_CONFIG, useValue: config },
    ],
  }).compile();
  return moduleRef.get(CacheService);
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

describe("cfields:{cohortId} cache + fieldsdef dependsOn (§2.1.3 row 5 / §2.1.2)", () => {
  async function build(cache: Cache, versionStore: any, config = cacheConfig()) {
    const fieldsRepository = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FieldsService,
        CacheService,
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

  const cohortRow = (itemId: string, value: string) => ({
    itemId,
    fieldId: `f-${itemId}`,
    label: "BOARD",
    value: [value],
    type: "text",
    fieldParams: null,
    sourceDetails: null,
  });

  it("miss then hit: Cohort custom fields are cached under cfields", async () => {
    const { fieldsService, fieldsRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsRepository.query.mockResolvedValue([cohortRow("c1", "CBSE")]);

    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");
    const second = await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");

    expect(second["c1"][0].selectedValues).toEqual(["CBSE"]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(1);
  });

  it("bumping fieldsdef invalidates cfields (a definition change re-processes every owner)", async () => {
    const { fieldsService, cacheService, fieldsRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsRepository.query.mockResolvedValueOnce([cohortRow("c1", "CBSE")]).mockResolvedValueOnce([cohortRow("c1", "ICSE")]);

    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");
    await cacheService.invalidate("fieldsdef"); // POST /fields/create etc.
    const after = await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");

    expect(after["c1"][0].selectedValues).toEqual(["ICSE"]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(2);
  });

  it("bumping an unrelated namespace does NOT invalidate cfields", async () => {
    const { fieldsService, cacheService, fieldsRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsRepository.query.mockResolvedValue([cohortRow("c1", "CBSE")]);

    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");
    await cacheService.invalidate("userfilter");
    await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");

    expect(fieldsRepository.query).toHaveBeenCalledTimes(1); // still served from cache
  });

  it("redis-down passthrough: Cohort fields still returned", async () => {
    const { fieldsService, fieldsRepository } = await build(redisDownCache(), redisDownVersionStore());
    fieldsRepository.query.mockResolvedValue([cohortRow("c1", "CBSE")]);

    const result = await fieldsService.getBulkCustomFieldDetails(["c1"], "Cohort");

    expect(result["c1"][0].selectedValues).toEqual(["CBSE"]);
    expect(fieldsRepository.query).toHaveBeenCalledTimes(1);
  });
});

describe("cohort:{tenantId} search cache (§2.1.3 row 1, pattern A)", () => {
  function fakeCohort(cacheService: CacheService, payloads: any[]) {
    let call = 0;
    return {
      cacheService,
      searchCohortData: jest.fn(async () => payloads[Math.min(call++, payloads.length - 1)]),
      searchCohort: CohortService.prototype.searchCohort,
    } as any;
  }
  const payload = (n: number) => ({ count: n, results: { cohortDetails: Array.from({ length: n }, (_, i) => ({ cohortId: `c${i}` })) } });

  it("miss then hit: same body served from cache, loader runs once", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeCohort(cacheService, [payload(1)]);
    const dto = { filters: { name: "a" } } as any;

    const r1 = resMock();
    await svc.searchCohort(TENANT, AY, dto, r1);
    const r2 = resMock();
    await svc.searchCohort(TENANT, AY, dto, r2);

    expect(r1.body.result).toEqual(payload(1));
    expect(r2.body.result).toEqual(payload(1));
    expect(svc.searchCohortData).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: bumping cohort:{t} re-runs the search", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeCohort(cacheService, [payload(1), payload(2)]);
    const dto = { filters: {} } as any;

    await svc.searchCohort(TENANT, AY, dto, resMock());
    await cacheService.invalidate(`cohort:${TENANT}`); // cohort create/update/delete
    const r = resMock();
    await svc.searchCohort(TENANT, AY, dto, r);

    expect(r.body.result).toEqual(payload(2));
    expect(svc.searchCohortData).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: search still runs and responds", async () => {
    const cacheService = await buildCacheService(redisDownCache(), redisDownVersionStore(), cacheConfig());
    const svc = fakeCohort(cacheService, [payload(1)]);

    const r = resMock();
    await svc.searchCohort(TENANT, AY, { filters: {} } as any, r);

    expect(r.statusCode).toBe(200);
    expect(r.body.result).toEqual(payload(1));
  });
});

describe("§2.1.4 invariant: a membership change bumps cohortmember:{t}, NOT cohort:{t}", () => {
  it("mycohorts (dependsOn cohortmember:{t}) goes stale on a membership change while cohort:{t} search stays cached", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());

    let myCohortsLoads = 0;
    let searchLoads = 0;
    const myCohorts = () =>
      cacheService.getOrLoad({
        namespace: `cohort:${TENANT}`,
        key: "mycohorts:u1",
        dependsOn: [`cohortmember:${TENANT}`, "fieldsdef"],
        ttlSeconds: 300,
        loader: async () => ({ n: ++myCohortsLoads }),
      });
    const search = () =>
      cacheService.getOrLoad({
        namespace: `cohort:${TENANT}`,
        key: "search:hash",
        dependsOn: ["fieldsdef"],
        ttlSeconds: 300,
        loader: async () => ({ n: ++searchLoads }),
      });

    await myCohorts();
    await search();

    // A membership change bumps ONLY cohortmember:{t} (as the member-write hooks do).
    await cacheService.invalidate(`cohortmember:${TENANT}`);

    await myCohorts(); // depends on cohortmember:{t} -> must reload
    await search(); // depends only on cohort:{t}+fieldsdef -> must stay cached

    expect(myCohortsLoads).toBe(2); // reloaded after the membership change
    expect(searchLoads).toBe(1); // cohort:{t} search was NOT invalidated
  });

  it("the member-write hook (publishCohortMemberEvent) invalidates cohortmember:{t} + userlist:{t} but never cohort:{t}", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const invalidateSpy = jest.spyOn(cacheService, "invalidate");
    const fakeThis: any = {
      cacheService,
      kafkaService: { publishCohortMemberEvent: jest.fn().mockResolvedValue(undefined) },
    };

    await CohortMembersService.prototype.publishCohortMemberEvent.call(
      fakeThis,
      "deleted",
      { tenantId: TENANT, cohortMembershipId: "m1" },
      "apiId"
    );

    const bumped = invalidateSpy.mock.calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    expect(bumped).toContain(`cohortmember:${TENANT}`);
    expect(bumped).toContain(`userlist:${TENANT}`);
    expect(bumped.some((ns) => ns.startsWith("cohort:"))).toBe(false); // the invariant
  });
});
