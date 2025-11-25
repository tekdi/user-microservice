import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";
import { JwtAuthGuard } from "../../../src/common/guards/keycloak.guard";
import { KeycloakService } from "../../../src/common/utils/keycloak.service";

// Placeholder template for user register e2e.
// Marked skipped until endpoints are confirmed.
describe.skip("User register (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KeycloakService)
      .useValue({
        login: async () => ({
          access_token: "fake.jwt.token",
          refresh_token: "dummy-refresh",
          expires_in: 3600,
          refresh_expires_in: 7200,
          token_type: "Bearer",
        }),
      })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.todo("should create a user and return 201");

  it("should reject invalid payload with 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/users") // adjust when route is confirmed
      .set(authHeaderFromToken(token))
      .send({});
    expect([400, 422]).toContain(res.status);
  });
});


