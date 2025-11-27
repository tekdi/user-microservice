import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";
import { JwtAuthGuard } from "../../../src/common/guards/keycloak.guard";
import { KeycloakService } from "../../../src/common/utils/keycloak.service";

describe("Auth login flow (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Bypass external Keycloak dependency during tests
      .overrideProvider(KeycloakService)
      .useValue({
        login: async () => ({
          access_token: generateFakeJwt({
            preferred_username: process.env.E2E_USERNAME || "test-user",
            name: "Test User",
            sub: "test-sub",
          }),
          refresh_token: "dummy-refresh",
          expires_in: 3600,
          refresh_expires_in: 7200,
          token_type: "Bearer",
        }),
        refreshToken: async () => ({
          access_token: "dummy-access",
          refresh_token: "dummy-refresh",
          expires_in: 3600,
          refresh_expires_in: 7200,
        }),
        logout: async () => ({}),
      })
      // Disable JWT verification in guard for e2e to avoid requiring real RSA key
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const hasCreds = !!process.env.E2E_USERNAME && !!process.env.E2E_PASSWORD;
  const maybe = hasCreds ? it : it.skip;

  maybe("should login and return access + refresh tokens", async () => {
    const result = await loginAndGetToken(app);
    expect(result).toBeDefined();
    expect(result?.access_token).toBeTruthy();
    expect(result?.refresh_token).toBeTruthy();
  });

  maybe("should use token to call /auth protected route", async () => {
    const result = await loginAndGetToken(app);
    expect(result?.access_token).toBeTruthy();
    const token = result && result.access_token ? result.access_token : "";
    const headers = {
      ...authHeaderFromToken(token),
    };
    if (process.env.E2E_TENANT_ID) {
      headers["tenantid"] = process.env.E2E_TENANT_ID;
    }
    console.info(`[e2e] GET /auth`);
    const res = await request(app.getHttpServer()).get("/auth").set(headers);
    if (res.status !== 200) {
      console.error(
        `[e2e] GET /auth failed with ${res.status}`,
        res.body || res.text
      );
    }
    expect(res.status).toBe(200);
    expect(res.body?.responseCode).toBe(200);
  });

  it("should return 400 when tenantid header is missing on /auth/rbac/token", async () => {
    console.info(`[e2e] GET /auth/rbac/token (missing tenantid)`);
    const res = await request(app.getHttpServer()).get("/auth/rbac/token");
    expect(res.status).toBe(400);
    // Some validation layers return default framework error bodies (no envelope)
    if (res.body && typeof res.body.responseCode !== "undefined") {
      expect(res.body.responseCode).toBe(400);
    }
  });

  it("should return 400 when tenantid header is not a UUID on /auth/rbac/token", async () => {
    console.info(`[e2e] GET /auth/rbac/token (invalid tenantid)`);
    const res = await request(app.getHttpServer())
      .get("/auth/rbac/token")
      .set("tenantid", "not-a-uuid");
    expect(res.status).toBe(400);
    if (res.body && typeof res.body.responseCode !== "undefined") {
      expect(res.body.responseCode).toBe(400);
    }
  });
});

function base64UrlEncode(obj: any): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateFakeJwt(payload: any): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = "signature"; // not validated by jwt-decode
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe("Auth login negative cases (e2e)", () => {
  let appInvalid: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Simulate Keycloak invalid credentials by throwing 401-like error
      .overrideProvider(KeycloakService)
      .useValue({
        login: async () => {
          const err: any = new Error("Unauthorized");
          err.response = { status: 401 };
          throw err;
        },
        refreshToken: async () => {
          const err: any = new Error("Unauthorized");
          err.response = { status: 401 };
          throw err;
        },
        logout: async () => ({}),
      })
      // Keep guard disabled so we can hit routes without RSA/JWT setup
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => true,
      })
      .compile();

    appInvalid = moduleRef.createNestApplication();
    await appInvalid.init();
  });

  afterAll(async () => {
    await appInvalid.close();
  });

  it("should return 404 when username not found", async () => {
    console.info(`[e2e-neg] POST /auth/login (username not found)`);
    const res = await request(appInvalid.getHttpServer())
      .post("/auth/login")
      .send({ username: "no-such-user@example.com", password: "irrelevant" });
    expect(res.status).toBe(404);
    expect(res.body?.responseCode).toBe(404);
    // Optional: message shape may vary; ensure failure envelope
    expect(res.body?.params?.status).toBe("failed");
  });

  it("should return 404 when password is incorrect", async () => {
    console.info(`[e2e-neg] POST /auth/login (incorrect password)`);
    const res = await request(appInvalid.getHttpServer())
      .post("/auth/login")
      .send({ username: "test-user", password: "wrong-password" });
    expect(res.status).toBe(404);
    expect(res.body?.responseCode).toBe(404);
    expect(res.body?.params?.status).toBe("failed");
  });
});
