import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenent.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantConfigAudit } from './entities/tenant-config-audit.entity';

describe('TenantService', () => {
  let service: TenantService;
  let tenantRepository: Repository<Tenant>;
  let tenantConfigRepository: Repository<TenantConfig>;
  let tenantConfigAuditRepository: Repository<TenantConfigAudit>;

  const mockTenantRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
    count: jest.fn(),
  };

  const mockTenantConfigRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockTenantConfigAuditRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: mockTenantRepository,
        },
        {
          provide: getRepositoryToken(TenantConfig),
          useValue: mockTenantConfigRepository,
        },
        {
          provide: getRepositoryToken(TenantConfigAudit),
          useValue: mockTenantConfigAuditRepository,
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    tenantRepository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant));
    tenantConfigRepository = module.get<Repository<TenantConfig>>(getRepositoryToken(TenantConfig));
    tenantConfigAuditRepository = module.get<Repository<TenantConfigAudit>>(getRepositoryToken(TenantConfigAudit));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Tenant Configuration', () => {
    it('should get tenant configs', async () => {
      const tenantId = 'test-tenant-id';
      const mockConfigs = [
        {
          id: 'config-1',
          tenantId,
          context: 'lms',
          config: { enableCertificates: true },
          version: 1,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockTenantConfigRepository.find.mockResolvedValue(mockConfigs);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await service.getTenantConfigs(tenantId, mockResponse as any);

      expect(mockTenantConfigRepository.find).toHaveBeenCalledWith({
        where: { tenantId },
        order: { context: 'ASC' },
      });
    });

    it('should get tenant config by context', async () => {
      const tenantId = 'test-tenant-id';
      const context = 'lms';
      const mockConfig = {
        id: 'config-1',
        tenantId,
        context,
        config: { enableCertificates: true },
        version: 1,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTenantConfigRepository.findOne.mockResolvedValue(mockConfig);

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      await service.getTenantConfigByContext(tenantId, context, mockResponse as any);

      expect(mockTenantConfigRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId, context },
      });
    });
  });
});
