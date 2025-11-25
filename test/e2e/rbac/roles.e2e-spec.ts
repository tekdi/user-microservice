import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("RBAC Roles (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /rbac/roles/read/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/rbac/roles/read/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  describe.skip("POST /rbac/roles/create", () => {
    it("should create role (201)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/rbac/roles/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("PUT /rbac/roles/update/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .put("/rbac/roles/update/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("POST /rbac/roles/list/roles returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/rbac/roles/list/roles")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([200, 204]).toContain(res.status);
  });

  it("DELETE /rbac/roles/delete/:roleId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/rbac/roles/delete/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });
});


