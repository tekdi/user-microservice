import { INestApplication } from "@nestjs/common";
import request from "supertest";

type LoginResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
};

function requireEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v) {
    console.warn(`[e2e] Missing env: ${name}`);
  }
  return v;
}

function hasKeycloakEnv(): boolean {
  const keys = [
    "KEYCLOAK",
    "KEYCLOAK_REALM",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
  ];
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(`[e2e] Missing Keycloak env(s): ${missing.join(", ")}`);
    return false;
  }
  return true;
}

export async function loginAndGetToken(
  app: INestApplication,
  username?: string,
  password?: string
): Promise<LoginResult | null> {
  const user = username || requireEnv("E2E_USERNAME");
  const pass = password || requireEnv("E2E_PASSWORD");

  // Log endpoint for visibility
  console.info(`[e2e] POST /auth/login`);

  if (!user || !pass) {
    console.warn("[e2e] Skipping login: credentials not provided");
    return null;
  }
  if (!hasKeycloakEnv()) {
    console.warn("[e2e] Skipping login: Keycloak env not fully configured");
    return null;
  }

  const res = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ username: user, password: pass });

  if (res.status !== 200) {
    console.error(
      `[e2e] POST /auth/login failed with ${res.status}`,
      res.body || res.text
    );
    throw new Error(`Login failed with status ${res.status}`);
  }

  // APIResponse success envelope
  return res.body?.result as LoginResult;
}

export function authHeaderFromToken(accessToken?: string): Record<string, string> {
  // AuthController.getUserByAuth expects the raw token in Authorization header, not "Bearer ..."
  return accessToken ? { Authorization: accessToken } : {};
}


