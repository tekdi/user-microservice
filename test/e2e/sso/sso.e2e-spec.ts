import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("SSO Authentication (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe.skip("POST /sso/authenticate", () => {
    it("should authenticate via SSO (200)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/sso/authenticate")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200]).toContain(res.status);
    });
  });

  it("POST /sso/authenticate invalid body returns 400/422", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/sso/authenticate")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });
});


