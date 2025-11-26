import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

jest.setTimeout(20000);
describe("Cohort (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /cohort/cohortHierarchy/:cohortId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/cohort/cohortHierarchy/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  describe.skip("POST /cohort/create", () => {
    it("should create cohort (201)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/cohort/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("POST /cohort/search returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/cohort/search")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([200, 204]).toContain(res.status);
  });

  it("PUT /cohort/update/:cohortId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .put("/cohort/update/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("DELETE /cohort/delete/:cohortId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/cohort/delete/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  it("GET /cohort/mycohorts/:userId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/cohort/mycohorts/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });
});


