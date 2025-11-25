import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../utils/app.factory";

describe("Health (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /health should return 200", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
  });
});


