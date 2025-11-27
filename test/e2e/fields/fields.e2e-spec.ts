import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

jest.setTimeout(20000);
describe("Fields (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe.skip("POST /fields/create", () => {
    it("should create field (201/200)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/fields/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("PATCH /fields/update/:fieldId invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .patch("/fields/update/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 404]).toContain(res.status);
  });

  it("POST /fields/search returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/fields/search")
      .set(withTenant(authHeaderFromToken(token)))
      .send({ filters: {} });
    expect([200, 204]).toContain(res.status);
  });

  describe.skip("POST /fields/values/create", () => {
    it("should create field values (201/200)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/fields/values/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("POST /fields/values/search returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/fields/values/search")
      .set(withTenant(authHeaderFromToken(token)))
      .send({ filters: {} });
    expect([200, 204]).toContain(res.status);
  });

  it("POST /fields/options/read returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/fields/options/read")
      .set(withTenant(authHeaderFromToken(token)))
      .send({ fieldName: "name" });
    expect([200, 204]).toContain(res.status);
  });

  it("DELETE /fields/options/delete/:fieldName invalid name returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/fields/options/delete/%00")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });

  it("GET /fields/formFields returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/fields/formFields")
      .set(withTenant(authHeaderFromToken(token)));
    expect([200, 204]).toContain(res.status);
  });

  it("DELETE /fields/values/delete invalid body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .delete("/fields/values/delete")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 422, 404]).toContain(res.status);
  });
});


