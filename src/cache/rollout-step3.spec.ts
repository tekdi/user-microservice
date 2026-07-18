import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CacheService } from "./cache.service";
import { CacheMetrics } from "./cache.metrics";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";
import { FieldsService } from "../fields/fields.service";
import { Fields } from "../fields/entities/fields.entity";
import { FieldValues } from "../fields/entities/fields-values.entity";
import { UserService } from "../user/user.service";
import { UserTenantMappingService } from "../userTenantMapping/user-tenant-mapping.service";
import { AssignRoleService } from "../rbac/assign-role/assign-role.service";
import { UserRoleMapping } from "../rbac/assign-role/entities/assign-role.entity";
import { Role } from "../rbac/role/entities/role.entity";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

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

/** Express-like response stub good enough for APIResponse.success/error. */
function resMock() {
  const out: any = { statusCode: 0, body: null };
  out.status = (code: number) => {
    out.statusCode = code;
    return out;
  };
  out.json = (data: any) => {
    out.body = data;
    return out;
  };
  return out;
}

describe("userfilter cache (§2.1.1 row 2, pattern C)", () => {
  async function build(cache: Cache, versionStore: any, config = cacheConfig()) {
    const fieldsValuesRepository = { query: jest.fn(), createQueryBuilder: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FieldsService,
        CacheService,
        CacheMetrics,
        { provide: getRepositoryToken(Fields), useValue: { query: jest.fn() } },
        { provide: getRepositoryToken(FieldValues), useValue: fieldsValuesRepository },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: CACHE_VERSION_STORE, useValue: versionStore },
        { provide: CACHE_CONFIG, useValue: config },
      ],
    }).compile();
    return {
      fieldsService: moduleRef.get(FieldsService),
      cacheService: moduleRef.get(CacheService),
      fieldsValuesRepository,
    };
  }

  it("miss then hit: identical (context, filterMap) pairs share one cached id-list", async () => {
    const { fieldsService, fieldsValuesRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsValuesRepository.query.mockResolvedValue([{ itemId: "u1" }, { itemId: "u2" }]);

    const first = await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"] });
    const second = await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"] });

    expect(first).toEqual(["u1", "u2"]);
    expect(second).toEqual(["u1", "u2"]);
    expect(fieldsValuesRepository.query).toHaveBeenCalledTimes(1);
  });

  it("key order does not matter: {a,b} and {b,a} hash to the same entry", async () => {
    const { fieldsService, fieldsValuesRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsValuesRepository.query.mockResolvedValue([{ itemId: "u1" }]);

    await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"], district: ["Pune"] });
    await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { district: ["Pune"], state: ["MH"] });

    expect(fieldsValuesRepository.query).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: bumping userfilter makes the next call re-query", async () => {
    const { fieldsService, cacheService, fieldsValuesRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsValuesRepository.query.mockResolvedValueOnce([{ itemId: "u1" }]).mockResolvedValueOnce([{ itemId: "u1" }, { itemId: "u3" }]);

    const before = await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"] });
    await cacheService.invalidate("userfilter"); // what every FieldValues write path does
    const after = await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"] });

    expect(before).toEqual(["u1"]);
    expect(after).toEqual(["u1", "u3"]);
    expect(fieldsValuesRepository.query).toHaveBeenCalledTimes(2);
  });

  it("no-match (null) results are never cached", async () => {
    const { fieldsService, fieldsValuesRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    fieldsValuesRepository.query.mockResolvedValue([]);

    expect(await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["XX"] })).toBeNull();
    expect(await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["XX"] })).toBeNull();
    expect(fieldsValuesRepository.query).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: loader still runs, result returned, no throw", async () => {
    const { fieldsService, fieldsValuesRepository } = await build(redisDownCache(), redisDownVersionStore());
    fieldsValuesRepository.query.mockResolvedValue([{ itemId: "u1" }]);

    const result = await fieldsService.filterUserUsingCustomFieldsOptimized("USERS", { state: ["MH"] });

    expect(result).toEqual(["u1"]);
    expect(fieldsValuesRepository.query).toHaveBeenCalledTimes(1);
  });
});

describe("userlist:{tenantId} cache (§2.1.1 row 3, pattern A)", () => {
  function queryBuilderMock(rows: any[]) {
    const qb: any = {};
    for (const m of ["leftJoin", "select", "groupBy", "addGroupBy", "andWhere", "orderBy", "offset", "limit"]) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue(rows);
    return qb;
  }

  function fakeUserService(cacheService: CacheService, rowsPerCall: any[][]) {
    let call = 0;
    const getRawMany = jest.fn();
    const self: any = {
      cacheService,
      usersRepository: {
        createQueryBuilder: jest.fn(() => {
          const qb = queryBuilderMock(rowsPerCall[Math.min(call, rowsPerCall.length - 1)]);
          getRawMany.mockImplementation(qb.getRawMany);
          call += 1;
          return qb;
        }),
      },
      getCoreColumnNames: async () => ["userId", "username", "status"],
      fieldsService: {
        filterUserUsingCustomFieldsOptimized: jest.fn(),
        getBulkCustomFieldDetails: jest.fn(async (ids: string[]) =>
          Object.fromEntries(ids.map((id) => [id, []]))),
      },
      findAllUserDetails: UserService.prototype.findAllUserDetails,
      findAllUserDetailsUncached: (UserService.prototype as any).findAllUserDetailsUncached,
    };
    return self;
  }

  const row = (userId: string) => ({ userId, username: userId, total_count: "1" });

  it("miss then hit: same body served from cache, DB queried once", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [[row("u1")]]);
    const dto = { limit: 10, offset: 0, filters: { status: ["active"] } };

    const first = await svc.findAllUserDetails(dto, TENANT);
    const second = await svc.findAllUserDetails(dto, TENANT);

    expect(first.getUserDetails).toHaveLength(1);
    expect(second.getUserDetails).toHaveLength(1);
    expect(svc.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: bumping userlist:{t} re-runs the query", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [[row("u1")], [row("u1"), row("u2")]]);
    const dto = { limit: 10, offset: 0 };

    const before = await svc.findAllUserDetails(dto, TENANT);
    await cacheService.invalidate(`userlist:${TENANT}`); // what every user/role/tenant write does
    const after = await svc.findAllUserDetails(dto, TENANT);

    expect(before.getUserDetails).toHaveLength(1);
    expect(after.getUserDetails).toHaveLength(2);
    expect(svc.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it("tenant isolation: same body under another tenant is its own entry", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [[row("u1")]]);
    const dto = { limit: 10 };

    await svc.findAllUserDetails(dto, TENANT);
    await svc.findAllUserDetails(dto, "33333333-3333-4333-8333-333333333333");

    expect(svc.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it("no-results (false) is never cached, and the tenant-less caller bypasses the cache", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const empty = fakeUserService(cacheService, [[]]);
    expect(await empty.findAllUserDetails({ limit: 10 }, TENANT)).toBe(false);
    expect(await empty.findAllUserDetails({ limit: 10 }, TENANT)).toBe(false);
    expect(empty.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(2);

    const noTenant = fakeUserService(cacheService, [[row("u1")]]);
    await noTenant.findAllUserDetails({ limit: 10 }, undefined);
    await noTenant.findAllUserDetails({ limit: 10 }, undefined);
    expect(noTenant.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: query still runs, result returned", async () => {
    const cacheService = await buildCacheService(redisDownCache(), redisDownVersionStore(), cacheConfig());
    const svc = fakeUserService(cacheService, [[row("u1")]]);

    const result = await svc.findAllUserDetails({ limit: 10 }, TENANT);

    expect(result.getUserDetails).toHaveLength(1);
    expect(svc.usersRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});

describe("usertenant:{userId} cache (§2.1.5)", () => {
  function fakeUtmService(cacheService: CacheService, rowsPerCall: any[][]) {
    let call = 0;
    const self: any = {
      cacheService,
      userTenantMappingRepository: {
        query: jest.fn(async () => rowsPerCall[Math.min(call++, rowsPerCall.length - 1)]),
      },
      getUserTenantMappings: UserTenantMappingService.prototype.getUserTenantMappings,
    };
    return self;
  }

  const mapping = { mappingId: 1, userId: USER, tenantId: TENANT, status: "active" };

  it("miss then hit: mappings served from cache on the second read", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUtmService(cacheService, [[mapping]]);

    const res1 = resMock();
    await svc.getUserTenantMappings(USER, false, res1);
    const res2 = resMock();
    await svc.getUserTenantMappings(USER, false, res2);

    expect(res1.body.result.mappings).toEqual([mapping]);
    expect(res2.body.result.mappings).toEqual([mapping]);
    expect(svc.userTenantMappingRepository.query).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: bumping usertenant:{userId} re-queries", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUtmService(cacheService, [[mapping], [mapping, { ...mapping, mappingId: 2 }]]);

    await svc.getUserTenantMappings(USER, false, resMock());
    await cacheService.invalidate(`usertenant:${USER}`); // assign-tenant / status-update / delete hook
    const res = resMock();
    await svc.getUserTenantMappings(USER, false, res);

    expect(res.body.result.mappings).toHaveLength(2);
    expect(svc.userTenantMappingRepository.query).toHaveBeenCalledTimes(2);
  });

  it("empty mapping list is never cached (404 path stays fresh)", async () => {
    const cacheService = await buildCacheService(fakeCache(), new MemoryCacheVersionStore(), cacheConfig());
    const svc = fakeUtmService(cacheService, [[]]);

    const res1 = resMock();
    await svc.getUserTenantMappings(USER, false, res1);
    const res2 = resMock();
    await svc.getUserTenantMappings(USER, false, res2);

    expect(res1.statusCode).toBe(404);
    expect(res2.statusCode).toBe(404);
    expect(svc.userTenantMappingRepository.query).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: mappings still returned", async () => {
    const cacheService = await buildCacheService(redisDownCache(), redisDownVersionStore(), cacheConfig());
    const svc = fakeUtmService(cacheService, [[mapping]]);

    const res = resMock();
    await svc.getUserTenantMappings(USER, false, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.result.mappings).toEqual([mapping]);
  });
});

describe("userroles:{userId} cache (§2.1.5, key diverges from doc — see catalog note)", () => {
  async function build(cache: Cache, versionStore: any, config = cacheConfig()) {
    const userRoleMappingRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const roleRepository = { findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignRoleService,
        CacheService,
        CacheMetrics,
        { provide: getRepositoryToken(UserRoleMapping), useValue: userRoleMappingRepository },
        { provide: getRepositoryToken(Role), useValue: roleRepository },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: CACHE_VERSION_STORE, useValue: versionStore },
        { provide: CACHE_CONFIG, useValue: config },
      ],
    }).compile();
    return {
      service: moduleRef.get(AssignRoleService),
      cacheService: moduleRef.get(CacheService),
      userRoleMappingRepository,
      roleRepository,
    };
  }

  const roleRow = { userId: USER, roleId: "r1", tenantId: TENANT };

  it("miss then hit: role mapping served from cache on the second GET", async () => {
    const { service, userRoleMappingRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    userRoleMappingRepository.findOne.mockResolvedValue(roleRow);

    const res1 = resMock();
    await service.getAssignedRole(USER, {} as any, res1);
    const res2 = resMock();
    await service.getAssignedRole(USER, {} as any, res2);

    expect(res1.body.result).toEqual(roleRow);
    expect(res2.body.result).toEqual(roleRow);
    expect(userRoleMappingRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it("write-then-fresh: role assignment (createAssignRole) bumps userroles + userlist so the next GET re-queries", async () => {
    const { service, userRoleMappingRepository, roleRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    const updatedRole = { ...roleRow, roleId: "r2" };
    userRoleMappingRepository.findOne
      .mockResolvedValueOnce(roleRow) // GET before
      .mockResolvedValueOnce(null) // createAssignRole duplicate check
      .mockResolvedValueOnce(updatedRole); // GET after
    roleRepository.findOne.mockResolvedValue({ roleId: "r2", tenantId: TENANT });
    userRoleMappingRepository.save.mockResolvedValue(updatedRole);

    await service.getAssignedRole(USER, {} as any, resMock());
    await service.createAssignRole(
      { user: { userId: "admin" } },
      { userId: USER, roleId: ["r2"], tenantId: TENANT } as any,
      resMock()
    );
    const res = resMock();
    await service.getAssignedRole(USER, {} as any, res);

    expect(res.body.result).toEqual(updatedRole);
  });

  it("missing role mapping (null) is never cached", async () => {
    const { service, userRoleMappingRepository } = await build(fakeCache(), new MemoryCacheVersionStore());
    userRoleMappingRepository.findOne.mockResolvedValue(null);

    await service.getAssignedRole(USER, {} as any, resMock());
    await service.getAssignedRole(USER, {} as any, resMock());

    expect(userRoleMappingRepository.findOne).toHaveBeenCalledTimes(2);
  });

  it("redis-down passthrough: GET still resolves from the DB", async () => {
    const { service, userRoleMappingRepository } = await build(redisDownCache(), redisDownVersionStore());
    userRoleMappingRepository.findOne.mockResolvedValue(roleRow);

    const res = resMock();
    await service.getAssignedRole(USER, {} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.result).toEqual(roleRow);
  });
});
