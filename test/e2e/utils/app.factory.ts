import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { JwtAuthGuard } from "../../../src/common/guards/keycloak.guard";
import { KeycloakService } from "../../../src/common/utils/keycloak.service";

export async function createTestApp(overrides?: {
  keycloak?: Partial<Record<keyof KeycloakService, any>>;
  guard?: { canActivate: () => boolean };
}): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(KeycloakService)
    .useValue({
      login: async () => ({
        // Valid-looking unsigned JWT so jwt-decode can parse it
        access_token:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
          "eyJzdWIiOiJ0ZXN0LXN1YiIsInByZWZlcnJlZF91c2VybmFtZSI6InRlc3QtdXNlciJ9." +
          "signature",
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
      ...(overrides?.keycloak || {}),
    })
    .overrideGuard(JwtAuthGuard)
    .useValue(overrides?.guard || { canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export function withTenant(headers: Record<string, string> = {}): Record<string, string> {
  const out = { ...headers };
  if (process.env.E2E_TENANT_ID) out["tenantid"] = process.env.E2E_TENANT_ID;
  return out;
}


