import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

jest.setTimeout(20000);
describe("AutomaticMember (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe.skip("POST /user/v1/automaticMember", () => {
    it("should create automatic member (201)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/automaticMember")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("GET /automaticMember should return 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/automaticMember")
      .set(withTenant(authHeaderFromToken(token)));
    expect([200, 204]).toContain(res.status);
  });

  it("GET /automaticMember/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/automaticMember/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  it("PATCH /automaticMember/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .patch("/automaticMember/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("DELETE /automaticMember/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/automaticMember/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });
});


