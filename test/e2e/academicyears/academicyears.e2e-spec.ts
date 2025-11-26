import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

jest.setTimeout(20000);
describe("AcademicYears (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe.skip("POST /academicyears/create", () => {
    it("should create academic year (201/200)", async () => {
      const token = (await loginAndGetToken(app))?.access_token;
      const res = await request(app.getHttpServer())
        .post("/academicyears/create")
        .set(withTenant(authHeaderFromToken(token)))
        .send({ /* payload */ });
      expect([200, 201]).toContain(res.status);
    });
  });

  it("POST /academicyears/list returns 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/academicyears/list")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([200, 204]).toContain(res.status);
  });

  it("GET /academicyears/:id invalid id returns 400/404", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/academicyears/not-a-uuid")
      .set(withTenant(authHeaderFromToken(token)));
    expect([400, 404]).toContain(res.status);
  });
});


