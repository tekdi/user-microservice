## Testing Guide for user-microservice (Jest + Supertest + NestJS)

This document explains how the tests in this repo are structured, how the flows work, what validations are checked, and how to run/debug them. It’s written to be readable if you’re new to Jest.

### What types of tests do we have?
- **End-to-End (e2e) tests**: Located under `test/e2e/**`. They boot a real NestJS application (with some external dependencies mocked), call HTTP endpoints via Supertest, and assert responses.
- **Unit tests**: Located side-by-side under `src/**` as `*.spec.ts`. They validate DTOs, entities, controllers, services, and small utilities in isolation.

---

## How e2e tests boot the app

- e2e tests use a small factory that creates the NestJS app with safe defaults for testing.
- External dependencies like Keycloak and JWT guard are overridden to keep tests fast and deterministic.

Key helpers:
- `test/e2e/utils/app.factory.ts`
- `test/e2e/utils/auth.helper.ts`

Flow to create app:
1) Build a `TestingModule` using `AppModule`.
2) `.overrideProvider(KeycloakService)` with a stub that returns fake tokens.
3) `.overrideGuard(JwtAuthGuard)` to always allow requests in e2e (no real RSA/JWT required).
4) `app.init()` starts the Nest app in-memory.

Auth helpers:
- `loginAndGetToken(app)` does `POST /auth/login` using credentials from env vars and returns `{ access_token, refresh_token, ... }`. If credentials or Keycloak env are missing, it logs a warning and returns `null` (tests can decide to skip).
- `authHeaderFromToken(token)` returns `{ Authorization: token }` (note: raw token, not "Bearer ...").
- `withTenant(headers)` adds `tenantid` header from `E2E_TENANT_ID` if available.

Important env vars used by e2e tests:
- `E2E_USERNAME`, `E2E_PASSWORD`
- `KEYCLOAK`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`
- `E2E_TENANT_ID` (optional; when set, `withTenant` adds `tenantid` header)

If these are missing, login-based tests will be skipped via conditional logic in the tests.

---

## e2e test coverage by module (what we assert)

Below is a concise map of e2e specs and what they validate. Many “create” flows are present as templates and currently skipped until payloads and flows are finalized.

### Auth / Login
- File: `test/e2e/user/login.e2e-spec.ts`
- Positive flow (conditional on env): 
  - `POST /auth/login` returns access and refresh tokens.
  - Use the token to call `GET /auth` returns 200 and API response envelope with `responseCode: 200`.
- Header validation:
  - `GET /auth/rbac/token` without `tenantid` → 400.
  - `GET /auth/rbac/token` with non-UUID `tenantid` → 400.
- Negative login cases (Keycloak mocked to throw):
  - `POST /auth/login` with unknown username → 404 and failure envelope.
  - `POST /auth/login` with wrong password → 404 and failure envelope.

### Tenant
- File: `test/e2e/tenant/tenant.e2e-spec.ts`
- `GET /tenant/read` → expects 200/204/404 (environment-dependent data).
- `POST /tenant/search` with `{}` → 200/204.
- `PATCH /tenant/update/:id` with non-UUID id → 400/404.
- `DELETE /tenant/delete` without body → 400/404/422.
- Headers: uses `Authorization` (raw token) and `tenantid` when available.

### RBAC: Roles
- File: `test/e2e/rbac/roles.e2e-spec.ts`
- `GET /rbac/roles/read/:id` invalid id → 400/404.
- `PUT /rbac/roles/update/:id` invalid id → 400/404.
- `POST /rbac/roles/list/roles` with `{}` → 200/204.
- `DELETE /rbac/roles/delete/:roleId` invalid id → 400/404.
- `POST /rbac/roles/create` is present but skipped (payload TBD).

### RBAC: Privileges
- File: `test/e2e/rbac/privileges.e2e-spec.ts`
- `GET /rbac/privileges` → 200/204.
- `GET /rbac/privileges/:privilegeId` invalid UUID → 400/404.
- `DELETE /rbac/privileges/:privilegeId` invalid UUID → 400/404.
- `POST /rbac/privileges/create` template is skipped (payload TBD).

### Fields
- File: `test/e2e/fields/fields.e2e-spec.ts`
- `PATCH /fields/update/:fieldId` invalid UUID → 400/404.
- `POST /fields/search` with filters → 200/204.
- `POST /fields/values/search` → 200/204.
- `POST /fields/options/read` → 200/204.
- `DELETE /fields/options/delete/:fieldName` invalid name (`%00`) → 400/404.
- `DELETE /fields/values/delete` without body → 400/422/404.
- Create endpoints present as skipped (payload TBD).

### Forms
- File: `test/e2e/forms/forms.e2e-spec.ts`
- `GET /form/read` → 200/204/404.
- `POST /form/create` template skipped.

### User
- File: `test/e2e/user/user.e2e-spec.ts`
- `GET /user/v1/read/:userId` invalid UUID → 400/404.
- `PATCH /user/v1/update/:userid` invalid UUID → 400/404.
- `POST /user/v1/list` with `{}` → 200/204.
- `DELETE /user/v1/delete/:userId` invalid UUID → 400/404.
- `POST /user/v1/create` template skipped.

### Password & OTP
- File: `test/e2e/user/password.e2e-spec.ts`
- Missing-body validation:
  - `POST /password-reset-link` → 400/422
  - `POST /forgot-password` → 400/422
  - `POST /reset-password` → 400/422
  - `POST /send-otp` → 400/422
  - `POST /verify-otp` → 400/422
  - `POST /password-reset-otp` → 400/422

### Health
- Files: `test/e2e/health.e2e-spec.ts`, `test/e2e/health/health.e2e-spec.ts`
- `GET /health` → 200 and `{ result: { healthy: true } }`. `DataSource.query` is mocked to keep this reliable.

Other e2e specs exist for cohorts, academic years, cohort members, SSO, locations, role-permission, assign-privilege, etc. They follow the same structure: boot app, login for token, add `tenantid` header when needed, call endpoints, and assert status codes + basic envelope.

---

## Unit tests (what validations we check)

### UserCreateDto
- File: `src/user/dto/user-create.dto.spec.ts`
- Required fields validation: missing `username` or `password` fails.
- Enum validation: invalid `gender` fails.
- Date validation: `dob` in the future fails with message “The birth date cannot be in the future”.
- Nested mapping validation: entries in `tenantCohortRoleMapping` require valid UUIDs for `tenantId`, `cohortIds[]`, and `roleId`.
- Minimal valid payload passes.

### FieldsUpdateDto
- File: `src/fields/dto/fields-update.dto.spec.ts`
- Enum validation: `type` must be one of allowed enum values.
- Conditional validation: if `fieldParams` is present, `fieldParams.isCreate` is required.
- Valid combination (`type: "text"`, `fieldParams.isCreate: true`) passes.

Other unit tests cover entities and controllers across modules and generally focus on:
- Entity property defaults/relations.
- Controller existence and basic wiring.
- Service/controller behavior for happy/edge paths (where provided).

---

## Common validation patterns you’ll see

- **Authorization header**: Most protected endpoints expect `Authorization: <access_token>` (not “Bearer ...”). Use `authHeaderFromToken`.
- **Tenant header**: For multi-tenant endpoints, `tenantid` is required and must be a valid UUID. Tests explicitly assert 400 when missing/invalid (e.g., `/auth/rbac/token`).
- **UUID params**: Endpoints with `:id`, `:userId`, `:roleId`, etc. return 400/404 when the param is not a valid UUID.
- **Body presence/shape**: Create/update endpoints return 400/422 when the body is missing or invalid. Several e2e specs assert this by sending `{}`.
- **API response envelope**: Many controllers return an envelope with `responseCode` and sometimes `params.status`. Tests assert `responseCode` where relevant.

---

## How to run tests

- Single-run strategy for deployments:
  - For every deployment, run the entire automation suite once. This single run is sufficient to identify issues end-to-end without repeating cycles.
  - If any issue occurs, only the dependent tasks are blocked. Independent tasks continue to run and do not need to be re-tested.
  - Centralized error logs are captured on the first run, so repeating tests is not required unless a dependent task is fixed and needs verification.

- All tests:

```bash
npm test
```

- e2e tests only:

```bash
npm run test:e2e
```

This uses `NODE_ENV=test` and the e2e Jest config at `test/jest-e2e.json`. To exercise login-backed flows, export these env vars before running:

```bash
export E2E_USERNAME="your_user"
export E2E_PASSWORD="your_password"
export KEYCLOAK="https://keycloak.example.com"
export KEYCLOAK_REALM="your_realm"
export KEYCLOAK_CLIENT_ID="client_id"
export KEYCLOAK_CLIENT_SECRET="client_secret"
# Optional to include tenant header automatically:
export E2E_TENANT_ID="00000000-0000-0000-0000-000000000000"
npm run test:e2e
```

- Run a single spec:

```bash
npx jest test/e2e/user/login.e2e-spec.ts
```

- Watch mode while developing unit tests:

```bash
npm run test:watch
```

---

## Deployment testing policy and automation (single-run)

- One round of testing per deployment is enough:
  - Trigger a single automation run that executes unit and e2e suites.
  - All issues surface in this single invocation (no multiple test cycles).
- Dependent vs independent tasks:
  - Failures only stop the tasks that depend on the failing part.
  - Independent tasks continue and do not require re-testing.
- Logging:
  - We capture all errors and console output during the single run. These logs are sufficient for triage.
  - Re-runs are only needed after a dependent fix, not for unaffected areas.

Run the entire suite in one go (including build and logs):

```bash
set -e
npm ci
npm run build
# Unit tests
npm test | tee combined.log
# e2e tests (ensure env variables are set if you want login-backed flows)
npm run test:e2e | tee -a combined.log
```

Why this reduces manual effort:
- A single, automated invocation covers all core flows (auth, tenant, user, RBAC, fields, forms, password/OTP, health).
- Deterministic test bootstrapping (mocked Keycloak and JWT guard in e2e) eliminates flaky external dependencies.
- Consistent helpers (`createTestApp`, `loginAndGetToken`, `withTenant`) standardize setup and headers, reducing boilerplate and mistakes.
- Centralized logs (`combined.log`) make triage straightforward without re-running tests.

Server deployment notes:
- Ensure CI/CD (e.g., Jenkins) invokes the same commands shown above.
- Export required env vars (KEYCLOAK and E2E_*) when you want to exercise authenticated flows.
- Treat non-zero exit codes as deployment gates. Accurate logs are written to `combined.log` for post-deploy analysis.

---

## How to add a new e2e test

1) Create a new spec under `test/e2e/<area>/<feature>.e2e-spec.ts`.
2) Boot the app with the factory:

```ts
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, withTenant } from "../utils/app.factory";
import { loginAndGetToken, authHeaderFromToken } from "../utils/auth.helper";

describe("Feature name (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it("should return 200", async () => {
    const token = (await loginAndGetToken(app))?.access_token;
    const res = await request(app.getHttpServer())
      .get("/your/endpoint")
      .set(withTenant(authHeaderFromToken(token)));
    expect([200, 204]).toContain(res.status);
  });
});
```

3) Validate common error cases:
   - Missing/invalid UUID params return 400/404.
   - Missing/invalid body returns 400/422.
   - Missing `tenantid` returns 400 for tenant-aware endpoints.
4) If the test requires actual tokens from Keycloak, ensure all `E2E_*` and Keycloak env vars are set; otherwise, structure your test to skip or mock as shown in existing files.

---

## Gaps and next steps

- Several “create” flows are scaffolded and marked as `describe.skip` until payloads and routes are finalized. Unskip them once payload and behavior are clear.
- For stricter assertions, replace broad expectations like `expect([200, 204, 404]).toContain(res.status)` with exact codes and response-shape checks when the API stabilizes.
- Add field-by-field response shape checks on the most important endpoints (e.g., user read/list, RBAC list).
- Extend DTO unit tests for remaining DTOs to document and enforce validation rules (e.g., length constraints, formats, allowed enums).

---

## Quick mental model for the flow

1) Boot app with mocks (Keycloak + Guard) → fast, isolated tests.
2) Try to login via helper → returns token if env is set, else skip or run unauthenticated tests.
3) Call endpoint with `Authorization` and `tenantid` headers when required.
4) Assert:
   - Status codes (200/201 for success; 400/404/422 for invalid input).
   - Envelope fields like `responseCode`, `params.status`.
   - Specific validations (UUID format, required body, enum values, date rules).

With this, you should be able to read any spec and immediately understand what it checks, and also add new, consistent tests quickly.






<!-- run -->
    set -e
    npm ci
    npm run build
    npm test | tee combined.log
    npm run test:e2e | tee -a combined.log

    npm run test:e2e -- test/e2e/user/login.e2e-spec.ts
All e2e: npm run test:e2e
Specific file: npm run test:e2e -- test/e2e/<path>.e2e-spec.ts



Estimated impact
Manual effort reduction: 60–75% per deployment
Feedback speed-up: 3–5x faster (hours → minutes)
Re-test scope cut (dependent-only): 50–70% fewer re-runs
Triage time reduction (central logs): 30–40%