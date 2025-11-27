import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

jest.setTimeout(20000);
describe("User (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /user/v1/read/:userId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/read/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  describe.skip("POST /user/v1/create", () => {
    it("should create user (201)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("PATCH /user/v1/update/:userid invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .patch("/update/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("POST /user/v1/list returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/list")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([200, 204]).toContain(res.status);
  });

  it("DELETE /user/v1/delete/:userId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/delete/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });
});


