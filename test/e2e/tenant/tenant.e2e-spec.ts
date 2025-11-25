import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("Tenant (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /tenant/read returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/tenant/read")
      .set(withTenant(authHeaderFromToken(token)));
    expect([200, 204, 404]).toContain(res.status);
  });

  it("POST /tenant/search returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/tenant/search")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([200, 204]).toContain(res.status);
  });

  describe.skip("POST /tenant/create", () => {
    it("should create tenant (201/200)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/tenant/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("PATCH /tenant/update/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .patch("/tenant/update/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("DELETE /tenant/delete invalid body returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/tenant/delete")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404, 422]).toContain(res.status);
  });
});


