import { Test, TestingModule } from "@nestjs/testing";
import { AutomaticMemberController } from "./automatic-member.controller";
import { AutomaticMemberService } from "./automatic-member.service";

describe("AutomaticMemberController", () => {
  let controller: AutomaticMemberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomaticMemberController],
      providers: [AutomaticMemberService],
    }).compile();

    controller = module.get<AutomaticMemberController>(
      AutomaticMemberController
    );
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
