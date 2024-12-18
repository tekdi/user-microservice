import { Test, TestingModule } from "@nestjs/testing";
import { AssignTenantController } from "./user-tenant-mapping.controller";

describe("AssignTenantController", () => {
  let controller: AssignTenantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignTenantController],
    }).compile();

    controller = module.get<AssignTenantController>(AssignTenantController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
