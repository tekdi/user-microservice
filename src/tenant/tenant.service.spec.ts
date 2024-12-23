import { Test, TestingModule } from "@nestjs/testing";
import { TenantService } from "./tenant.service";
import { EntityManager, Repository } from "typeorm";
import { Tenant } from "./entities/tenent.entity";
import { getRepositoryToken, TypeOrmModule } from "@nestjs/typeorm";
import { Response } from "express";
import { v4 } from "uuid";
import { TypeormService } from "../services/typeorm";
import { ServicesModule } from "../services/services.module";
import { ConfigModule, ConfigService } from "@nestjs/config";

jest.mock("uuid", () => ({
  v4: jest.fn(),
}));

// jest.mock("typeorm", () => {
//   const originalModule = jest.requireActual("typeorm");
//   return {
//     ...originalModule,
//     Repository: jest.fn().mockImplementation(() => ({
//       save: jest.fn(),
//       findOne: jest.fn(),
//       find: jest.fn(),
//       delete: jest.fn(),
//       query: jest.fn(),
//       update: jest.fn(),
//     })),
//     EntityManager: jest.fn().mockImplementation(() => ({
//       save: jest.fn(),
//       findOne: jest.fn(),
//       find: jest.fn(),
//       delete: jest.fn(),
//       update: jest.fn(),
//     })),
//   };
// });
// const mockRepository = {
//   save: jest.fn(),
//   findOne: jest.fn(),
//   find: jest.fn(),
//   delete: jest.fn(),
//   create: jest.fn(),
//   query: jest.fn(),
//   update: jest.fn(),
// };

describe("TenantService", () => {
  let service: TenantService;
  //let tenantRepository: Repository<Tenant>;
  let req: Request;
  let responseMock: Partial<Response>;
  let entityManager: EntityManager;

  beforeEach(async () => {
    responseMock = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }), // Ensure ConfigModule is loaded globally in tests
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (configService: ConfigService) => ({
            type: "postgres",
            host: configService.get("POSTGRES_HOST"),
            port: configService.get("POSTGRES_PORT"),
            database: configService.get("POSTGRES_DATABASE"),
            username: configService.get("POSTGRES_USERNAME"),
            password: configService.get("POSTGRES_PASSWORD"),
            entities: [Tenant], // Register your entities
            synchronize: true, // Auto synchronize (use cautiously in production)
          }),
          // Inject ConfigService here
        }),
        TypeOrmModule.forFeature([Tenant]), // Register your repositories
        ServicesModule,
      ],
      providers: [TenantService, TypeormService, EntityManager],
    }).compile();
    service = module.get<TenantService>(TenantService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
  //getTenants success
  it("should return an list of tenants", async () => {
    //mock apiId
    (v4 as jest.Mock).mockReturnValue("c7ceaefd-cf99-4427-84b2-ac67f75698eb");
    //mock today date
    const isoDate = "2024-12-09T07:17:07.397Z";
    jest.spyOn(Date.prototype, "toISOString").mockReturnValue(isoDate);
    let tenants: Tenant[] = [
      {
        tenantId: "6c8b810a-66c2-4f0d-8c0c-c025415a4414",
        name: "YouthNet",
        domain: "pratham.youthnet.com",
        params: null,
        programImages: [
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/8a756566-f4f2-48d9-807b-0d2c2ea4dc27.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/e1f749e6-d251-4fed-bb5a-27bddcca5b11.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/ba1ebe3b-edda-4f64-96ad-a61e71adf187.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/37b0ff1f-8c21-4aa6-bae7-ecbcbdcdbad7.png",
        ],
        description:
          "Get vocational training to land an entry level job with 2 months of training ",
        status: "active",
        createdBy: null,
        updatedBy: null,
        createdAt: "2024-09-25T11:41:02.852Z",
        updatedAt: "2024-11-19T06:17:18.157Z",
      },
      {
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        name: "Second Chance Program",
        domain: "pratham.shiksha.com",
        params: null,
        programImages: [
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/3f931098-8151-4f57-a284-77eda8055a88.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/37fc341e-ff8d-479b-8625-d81f6a478701.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/7945c6e5-d1aa-4f60-8d30-a4758b326b70.png",
          "https://program-image-dev.s3.ap-south-1.amazonaws.com/5decba67-19e7-4203-a14c-bd1fdbb88154.png",
        ],
        description:
          "Get a second chance to complete your 10th grade education",
        status: "active",
        createdBy: null,
        updatedBy: null,
        createdAt: "2024-04-11T07:28:14.558Z",
        updatedAt: "2024-11-19T06:17:36.258Z",
      },
    ];
    const roleForFirstTenant = [
      {
        roleId: "fd721198-0439-473d-8f50-37a4f6757af2",
        name: "Student",
        code: "student",
        tenantId: "6c8b810a-66c2-4f0d-8c0c-c025415a4414",
        createdAt: "2024-11-12T09:13:02.811Z",
        updatedAt: "2024-11-12T09:13:02.811Z",
        createdBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
        updatedBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
      },
    ];
    const roleForSecondTenant = [
      {
        roleId: "3bde0028-6900-4900-9d05-eeb608843718",
        name: "Teacher",
        code: "teacher",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-05-09T06:23:44.212Z",
        updatedAt: "2024-05-09T06:23:44.212Z",
        createdBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
        updatedBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
      },
      {
        roleId: "9dd9328f-1bc7-444f-96e3-c5e1daa3514a",
        name: "Team Leader",
        code: "team_leader",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-05-09T06:24:22.768Z",
        updatedAt: "2024-05-09T06:24:22.768Z",
        createdBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
        updatedBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
      },
      {
        roleId: "ee482faf-8a41-45fe-9656-5533dd6a787c",
        name: "Admin",
        code: "admin",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-05-09T06:24:03.206Z",
        updatedAt: "2024-05-09T06:24:03.206Z",
        createdBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
        updatedBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
      },
      {
        roleId: "d72a1347-30cb-4d64-b5de-11825777f3a1",
        name: "Assessment Admin",
        code: "super_admin",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-10-21T12:54:11.620Z",
        updatedAt: "2024-10-21T12:54:11.620Z",
        createdBy: "9ef7e86c-263e-4621-a7d8-643ca3f90609",
        updatedBy: "9ef7e86c-263e-4621-a7d8-643ca3f90609",
      },
      {
        roleId: "493c04e2-a9db-47f2-b304-503da358d5f4",
        name: "Student",
        code: "student",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-05-10T10:07:19.537Z",
        updatedAt: "2024-05-10T10:07:19.537Z",
        createdBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
        updatedBy: "61072e6d-bce2-4ea5-982f-07d550e9a534",
      },
      {
        roleId: "cd61cb13-1371-4ef4-b459-c319f926e41a",
        name: "Content Reviewer",
        code: "content_reviewer",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-11-15T07:04:48.075Z",
        updatedAt: "2024-11-15T07:04:48.075Z",
        createdBy: null,
        updatedBy: null,
      },
      {
        roleId: "89acf88a-fb85-4d4f-a50a-57e0749918a2",
        name: "Central Admin MME",
        code: "central_admin_mme",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-11-18T11:15:47.671Z",
        updatedAt: "2024-11-18T11:15:47.671Z",
        createdBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
        updatedBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
      },
      {
        roleId: "3b2d9b5a-7b57-4aff-99c6-a45f42518b85",
        name: "Central Admin CCTA",
        code: "central_admin_ccta",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-11-18T11:16:59.276Z",
        updatedAt: "2024-11-18T11:16:59.276Z",
        createdBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
        updatedBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
      },
      {
        roleId: "e9ffbcab-1ebf-49b0-b162-539547d0d880",
        name: "State Admin MME",
        code: "state_admin_mme",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-11-19T10:04:01.319Z",
        updatedAt: "2024-11-19T10:04:01.319Z",
        createdBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
        updatedBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
      },
      {
        roleId: "f972a14e-afdb-4502-8ede-cf1fcf171e46",
        name: "State Admin SCTA",
        code: "state_admin_scta",
        tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
        createdAt: "2024-11-18T11:13:06.909Z",
        updatedAt: "2024-11-18T11:13:06.909Z",
        createdBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
        updatedBy: "3e0bda6b-c506-466f-8875-e37de52a0e8f",
      },
    ];
    const finalResult = {
      id: "api.tenant.list",
      ver: "1.0",
      ts: "2024-12-09T07:17:07.397Z",
      params: {
        resmsgid: "c7ceaefd-cf99-4427-84b2-ac67f75698eb",
        status: "successful",
        err: null,
        errmsg: null,
        successmessage: "Tenant fetched successfully.",
      },
      responseCode: 200,
      result: [
        {
          tenantId: "6c8b810a-66c2-4f0d-8c0c-c025415a4414",
          name: "YouthNet",
          domain: "pratham.youthnet.com",
          createdAt: "2024-09-25T11:41:02.852Z",
          updatedAt: "2024-11-19T06:17:18.157Z",
          params: null,
          programImages: [
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/8a756566-f4f2-48d9-807b-0d2c2ea4dc27.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/e1f749e6-d251-4fed-bb5a-27bddcca5b11.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/ba1ebe3b-edda-4f64-96ad-a61e71adf187.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/37b0ff1f-8c21-4aa6-bae7-ecbcbdcdbad7.png",
          ],
          description:
            "Get vocational training to land an entry level job with 2 months of training ",
          status: "active",
          createdBy: null,
          updatedBy: null,
          role: [
            {
              roleId: "fd721198-0439-473d-8f50-37a4f6757af2",
              name: "Student",
              code: "student",
            },
          ],
        },
        {
          tenantId: "ef99949b-7f3a-4a5f-806a-e67e683e38f3",
          name: "Second Chance Program",
          domain: "pratham.shiksha.com",
          createdAt: "2024-04-11T07:28:14.558Z",
          updatedAt: "2024-11-19T06:17:36.258Z",
          params: null,
          programImages: [
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/3f931098-8151-4f57-a284-77eda8055a88.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/37fc341e-ff8d-479b-8625-d81f6a478701.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/7945c6e5-d1aa-4f60-8d30-a4758b326b70.png",
            "https://program-image-dev.s3.ap-south-1.amazonaws.com/5decba67-19e7-4203-a14c-bd1fdbb88154.png",
          ],
          description:
            "Get a second chance to complete your 10th grade education",
          status: "active",
          createdBy: null,
          updatedBy: null,
          role: [
            {
              roleId: "3bde0028-6900-4900-9d05-eeb608843718",
              name: "Teacher",
              code: "teacher",
            },
            {
              roleId: "9dd9328f-1bc7-444f-96e3-c5e1daa3514a",
              name: "Team Leader",
              code: "team_leader",
            },
            {
              roleId: "ee482faf-8a41-45fe-9656-5533dd6a787c",
              name: "Admin",
              code: "admin",
            },
            {
              roleId: "d72a1347-30cb-4d64-b5de-11825777f3a1",
              name: "Assessment Admin",
              code: "super_admin",
            },
            {
              roleId: "493c04e2-a9db-47f2-b304-503da358d5f4",
              name: "Student",
              code: "student",
            },
            {
              roleId: "cd61cb13-1371-4ef4-b459-c319f926e41a",
              name: "Content Reviewer",
              code: "content_reviewer",
            },
            {
              roleId: "89acf88a-fb85-4d4f-a50a-57e0749918a2",
              name: "Central Admin MME",
              code: "central_admin_mme",
            },
            {
              roleId: "3b2d9b5a-7b57-4aff-99c6-a45f42518b85",
              name: "Central Admin CCTA",
              code: "central_admin_ccta",
            },
            {
              roleId: "e9ffbcab-1ebf-49b0-b162-539547d0d880",
              name: "State Admin MME",
              code: "state_admin_mme",
            },
            {
              roleId: "f972a14e-afdb-4502-8ede-cf1fcf171e46",
              name: "State Admin SCTA",
              code: "state_admin_scta",
            },
          ],
        },
      ],
    };
    //jest.spyOn(tenantRepository, "find").mockResolvedValue(tenants);
    await service.getTenants(req, responseMock as Response);

    expect(responseMock.status).toHaveBeenCalledWith(200);
    expect(responseMock.json).toHaveBeenCalledTimes(1);
    expect(responseMock.json).toHaveBeenCalledWith(finalResult);
    //expect(tenantRepository.find).toHaveBeenCalled();
  });
  //createTenants success
  // it("should create tenant", async () => {
  //   //mock apiId
  //   (v4 as jest.Mock).mockReturnValue("89a86134-b832-4639-bb1f-b1ffe445b3c0");
  //   //mock today date
  //   const isoDate = "2024-12-09T10:15:33.092Z";
  //   jest.spyOn(Date.prototype, "toISOString").mockReturnValue(isoDate);
  //   const tenantCreateDto = {
  //     name: "Unit test",
  //     domain: "unit_test.com",
  //     createdBy: null,
  //   };
  //   const checkExitTenants = [];
  //   const createResult: Tenant = {
  //     name: "Unit test",
  //     domain: "unit_test.com",
  //     createdBy: null,
  //     params: null,
  //     programImages: null,
  //     updatedBy: null,
  //     tenantId: "8fa1a1d6-80c9-4010-9288-043c7dcae94f",
  //     createdAt: "2024-12-09T10:15:12.667Z",
  //     updatedAt: "2024-12-09T10:15:12.667Z",
  //     status: "active",
  //     description: "",
  //   };
  //   const finalResult = {
  //     id: "api.tenant.create",
  //     ver: "1.0",
  //     ts: "2024-12-09T10:15:33.092Z",
  //     params: {
  //       resmsgid: "89a86134-b832-4639-bb1f-b1ffe445b3c0",
  //       status: "successful",
  //       err: null,
  //       errmsg: null,
  //       successmessage: "Tenant created successfully",
  //     },
  //     responseCode: 201,
  //     result: {
  //       name: "Unit test",
  //       domain: "unit_test.com",
  //       createdBy: null,
  //       params: null,
  //       programImages: null,
  //       updatedBy: null,
  //       description: "",
  //       tenantId: "8fa1a1d6-80c9-4010-9288-043c7dcae94f",
  //       createdAt: "2024-12-09T10:15:12.667Z",
  //       updatedAt: "2024-12-09T10:15:12.667Z",
  //       status: "active",
  //     },
  //   };
  //   jest.spyOn(tenantRepository, "find").mockResolvedValue(checkExitTenants);
  //   jest.spyOn(tenantRepository, "save").mockResolvedValue(createResult);
  //   await service.createTenants(req, tenantCreateDto, responseMock as Response);
  //   expect(responseMock.status).toHaveBeenCalledWith(201);
  //   expect(responseMock.json).toHaveBeenCalledTimes(1);
  //   expect(responseMock.json).toHaveBeenCalledWith(finalResult);
  //   expect(tenantRepository.find).toHaveBeenCalled();
  // });
  // //updateTenants success
  // it("should update tenant", async () => {
  //   //mock apiId
  //   (v4 as jest.Mock).mockReturnValue("e3ce0180-a73a-4c49-a7ae-bb87c18fc065");
  //   //mock today date
  //   const isoDate = "2024-12-09T11:26:08.436Z";
  //   jest.spyOn(Date.prototype, "toISOString").mockReturnValue(isoDate);
  //   const tenantUpdateDto = {
  //     name: "Unit test",
  //     domain: "unit_test.com",
  //     createdBy: null,
  //   };
  //   const checkExitTenants: Tenant[] = [
  //     {
  //       tenantId: "8fa1a1d6-80c9-4010-9288-043c7dcae94f",
  //       name: "Unit test",
  //       domain: "unit_test.com",
  //       createdAt: "2024-12-09T10:15:12.667Z",
  //       updatedAt: "2024-12-09T10:15:12.667Z",
  //       params: null,
  //       programImages: null,
  //       description: null,
  //       status: "active",
  //       createdBy: null,
  //       updatedBy: null,
  //     },
  //   ];
  //   const updateResult = {
  //     generatedMaps: [],
  //     raw: [],
  //     affected: 1,
  //   };
  //   const finalResult = {
  //     id: "api.tenant.update",
  //     ver: "1.0",
  //     ts: "2024-12-09T11:26:08.436Z",
  //     params: {
  //       resmsgid: "e3ce0180-a73a-4c49-a7ae-bb87c18fc065",
  //       status: "successful",
  //       err: null,
  //       errmsg: null,
  //       successmessage: "Tenant updated successfully",
  //     },
  //     responseCode: 200,
  //     result: {
  //       generatedMaps: [],
  //       raw: [],
  //       affected: 1,
  //     },
  //   };
  //   jest.spyOn(tenantRepository, "find").mockResolvedValue(checkExitTenants);
  //   jest.spyOn(tenantRepository, "update").mockResolvedValue(updateResult);
  //   await service.updateTenants(
  //     req,
  //     "8fa1a1d6-80c9-4010-9288-043c7dcae94f",
  //     tenantUpdateDto,
  //     responseMock as Response
  //   );
  //   expect(responseMock.status).toHaveBeenCalledWith(200);
  //   expect(responseMock.json).toHaveBeenCalledTimes(1);
  //   expect(responseMock.json).toHaveBeenCalledWith(finalResult);
  //   expect(tenantRepository.find).toHaveBeenCalled();
  // });
  // //deleteTenants success
  // it("should delete tenant", async () => {
  //   //mock apiId
  //   (v4 as jest.Mock).mockReturnValue("a4f132e0-d30b-483a-93c5-1b3faf26b6b3");
  //   //mock today date
  //   const isoDate = "2024-12-09T12:02:01.289Z";
  //   jest.spyOn(Date.prototype, "toISOString").mockReturnValue(isoDate);
  //   const tenantUpdateDto = {
  //     name: "Unit test",
  //     domain: "unit_test.com",
  //     createdBy: null,
  //   };
  //   const checkExitTenants: Tenant[] = [
  //     {
  //       tenantId: "46d3e4c0-6c67-46b8-8420-fbadcf1cc7ce",
  //       name: "Unit testing using jest",
  //       domain: "unit_test.com",
  //       createdAt: "2024-12-09T10:15:12.667Z",
  //       updatedAt: "2024-12-09T10:15:12.667Z",
  //       params: null,
  //       programImages: null,
  //       description: null,
  //       status: "active",
  //       createdBy: null,
  //       updatedBy: null,
  //     },
  //   ];
  //   const deleteResult = {
  //     raw: [],
  //     affected: 1,
  //   };
  //   const finalResult = {
  //     id: "api.tenant.delete",
  //     ver: "1.0",
  //     ts: "2024-12-09T12:02:01.289Z",
  //     params: {
  //       resmsgid: "a4f132e0-d30b-483a-93c5-1b3faf26b6b3",
  //       status: "successful",
  //       err: null,
  //       errmsg: null,
  //       successmessage: "Tenant deleted successfully",
  //     },
  //     responseCode: 200,
  //     result: {
  //       raw: [],
  //       affected: 1,
  //     },
  //   };
  //   jest.spyOn(tenantRepository, "find").mockResolvedValue(checkExitTenants);
  //   jest.spyOn(tenantRepository, "delete").mockResolvedValue(deleteResult);
  //   await service.deleteTenants(
  //     req,
  //     "46d3e4c0-6c67-46b8-8420-fbadcf1cc7ce",
  //     responseMock as Response
  //   );
  //   expect(responseMock.status).toHaveBeenCalledWith(200);
  //   expect(responseMock.json).toHaveBeenCalledTimes(1);
  //   expect(responseMock.json).toHaveBeenCalledWith(finalResult);
  //   expect(tenantRepository.find).toHaveBeenCalled();
  // });
});
