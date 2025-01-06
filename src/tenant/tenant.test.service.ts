import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenent.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('TenantService', () => {
  let service: TenantService;
  let tenantRepository: Repository<Tenant>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        {
          provide: getRepositoryToken(Tenant),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
    tenantRepository = module.get<Repository<Tenant>>(getRepositoryToken(Tenant));
  });
});
