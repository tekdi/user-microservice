import { Test, TestingModule } from "@nestjs/testing";
import { AutomaticMemberService } from "./automatic-member.service";

describe("AutomaticMemberService", () => {
  let service: AutomaticMemberService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomaticMemberService],
    }).compile();

    service = module.get<AutomaticMemberService>(AutomaticMemberService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
