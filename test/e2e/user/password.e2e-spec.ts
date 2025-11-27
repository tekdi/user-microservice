import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("User Password & OTP (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("POST /password-reset-link with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/password-reset-link")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  it("POST /forgot-password with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/forgot-password")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  it("POST /reset-password with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/reset-password")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  it("POST /send-otp with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/send-otp")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  it("POST /verify-otp with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/verify-otp")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });

  it("POST /password-reset-otp with missing body returns 400", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .post("/password-reset-otp")
      .set(withTenant(authHeaderFromToken(token)))
      .send({});
    expect([400, 422]).toContain(res.status);
  });
});


