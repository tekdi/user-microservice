// typeorm.service.spec.ts
import { Test, TestingModule } from "@nestjs/testing";
import { DataSource, EntityManager, Repository } from "typeorm";
import { TypeormService } from "./typeorm";
import { Tenant } from "../tenant/entities/tenent.entity";
import { User } from "src/user/entities/user-entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";

const entityArray = [Tenant, User];
describe("TypeormService", () => {
  let service: TypeormService;
  let entityManager: EntityManager;
  let entityRepository: Repository<Tenant>; // Use your entity here

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TypeormService, EntityManager, DataSource],
      imports: [

      ],
    }).compile();

    service = module.get<TypeormService>(TypeormService);
    entityManager = module.get<EntityManager>(EntityManager);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("find", () => {
    it("should return an array of entities", async () => {
      const result = await service.find(Tenant, {}); // Pass entity name and options
      console.log("result: ", result);
      expect(result).not.toBeNull();
      expect(entityRepository.find).toHaveBeenCalledWith({});
    });
  });
});
