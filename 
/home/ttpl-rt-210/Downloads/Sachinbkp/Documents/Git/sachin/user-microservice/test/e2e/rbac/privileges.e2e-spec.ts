import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("RBAC Privileges (e2e)", () => {
  let app: INestApplication;
  let token: string | undefined;
  let createdPrivilegeId: string | undefined;

  beforeAll(async () => {
    app = await createTestApp();
    token = (await loginAndGetToken(app))?.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /rbac/privileges returns 200 with required query params", async () => {
    const tenantId = process.env.E2E_TENANT_ID || "00000000-0000-0000-0000-000000000000";
    const roleId = "00000000-0000-0000-0000-000000000001"; // dummy UUID; may return 404 but should be 200/204 if exists
    const res = await request(app.getHttpServer())
      .get(`/rbac/privileges?tenantId=${tenantId}&roleId=${roleId}`)
      .set(withTenant(Object.assign({}, authHeaderFromToken(token))));

    expect([200, 204]).toContain(res.status);
  });

  it("POST /rbac/privileges/create should create privilege (201) and capture id", async () => {
    const code = `e2e_code_${Date.now()}`;
    const payload = { privileges: [{ title: "E2E Privilege", code }] };

    const res = await request(app.getHttpServer())
      .post("/rbac/privileges/create")
      .set(withTenant(Object.assign({}, authHeaderFromToken(token))))
      .send(payload);

    expect([200, 201]).toContain(res.status);
    const created = res.body?.result?.privileges?.[0];
    expect(!!created && !!created.privilegeId).toBe(true);
    createdPrivilegeId = created?.privilegeId;
  });

  it("GET /rbac/privileges/:privilegeId with valid id returns 200", async () => {
    expect(!!createdPrivilegeId).toBe(true);
    const res = await request(app.getHttpServer())
      .get(`/rbac/privileges/${createdPrivilegeId}`)
      .set(withTenant(authHeaderFromToken(token)));

    expect(res.status).toBe(200);
    expect(res.body?.result?.privilegeId).toBe(createdPrivilegeId);
  });

  it("DELETE /rbac/privileges/:privilegeId with valid id returns 200/204", async () => {
    expect(!!createdPrivilegeId).toBe(true);
    const res = await request(app.getHttpServer())
      .delete(`/rbac/privileges/${createdPrivilegeId}`)
      .set(withTenant(authHeaderFromToken(token)));

    expect([200, 204]).toContain(res.status);
  });

  it("DELETE /rbac/privileges/:privilegeId (after deletion) returns 404", async () => {
    expect(!!createdPrivilegeId).toBe(true);
    const res = await request(app.getHttpServer())
      .delete(`/rbac/privileges/${createdPrivilegeId}`)
      .set(withTenant(authHeaderFromToken(token)));

    expect(res.status).toBe(404);
  });
});
