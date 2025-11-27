## E2E Auth Login Flow — How it works and how to run it

This document explains the end-to-end login test flow, execution order, the internal calls that happen, and how you can run just the login test or the full flow.

### What this test verifies
- The API accepts credentials at `POST /auth/login` and returns an auth envelope with `access_token` and `refresh_token`.
- The returned `access_token` can be used to call a protected route (here, `GET /auth`), with the token placed directly in the `Authorization` header (no `Bearer ` prefix).

---

### Execution order inside the e2e test

1) `beforeAll` — Boot the Nest application for tests
- Creates a `TestingModule` importing the real `AppModule`
- Overrides `KeycloakService` to avoid external Keycloak calls (returns fake tokens)
- Overrides `JwtAuthGuard` so protected routes are accessible in tests
- Initializes the Nest app instance

2) Test: “should login and return access + refresh tokens”
- Uses `loginAndGetToken(app)` helper which internally:
  - `supertest` POSTs `{"username","password"}` to `/auth/login`
  - Extracts `result` from the API response envelope
  - Returns `{ access_token, refresh_token, ... }`

3) Test: “should use token to call /auth protected route”
- Calls `loginAndGetToken(app)` again to obtain a token
- Sends `GET /auth` with:
  - `Authorization: <access_token>` (raw token, no `Bearer`)
  - Optionally `tenantid: <uuid>` if `E2E_TENANT_ID` is set
- Expects `200` and a successful response envelope

4) `afterAll` — Close the Nest app

---

### Internal call flow (data path)

1) `supertest` → `POST /auth/login` on the in-memory app server  
2) Nest routes request → `AuthController.login`  
3) `AuthController.login` → `AuthService.login`  
4) `AuthService.login` → `KeycloakService.login(username,password)`  
   - In e2e, `KeycloakService` is mocked to return a fake JWT and tokens  
5) `AuthService.login` wraps tokens with `APIResponse.success` and returns  
6) The test gets `res.body.result` → tokens  
7) `supertest` → `GET /auth` with `Authorization: <token>` (and optional `tenantid`)  
8) `JwtAuthGuard` is overridden in e2e to allow access, so the route responds `200`

---

### Where the pieces live (key files)
- E2E spec:
  - `test/e2e/auth-login.e2e-spec.ts`
- Helper used by spec:
  - `test/e2e/utils/auth.helper.ts`
- Login endpoint:
  - `src/auth/auth.controller.ts` (`POST /auth/login`)
  - `src/auth/auth.service.ts` (calls `KeycloakService.login`, wraps response)
- Guard mocked for e2e:
  - `src/common/guards/keycloak.guard.ts` (overridden in the e2e spec)
- Keycloak client (mocked in e2e):
  - `src/common/utils/keycloak.service.ts`

---

### Environment variables used by the e2e
These allow the helper and mocked token to derive values. In the current setup they are required by the helper even though Keycloak is mocked:

- Required by helper:
  - `E2E_USERNAME`, `E2E_PASSWORD`
  - `KEYCLOAK`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`
- Optional for protected route:
  - `E2E_TENANT_ID` (added as `tenantid` header if present)

Example:
```bash
export E2E_USERNAME="test-user" E2E_PASSWORD="secret" \
       KEYCLOAK="1" KEYCLOAK_REALM="1" KEYCLOAK_CLIENT_ID="1" KEYCLOAK_CLIENT_SECRET="1"
```

If you have a `.env.test`, you can source it:
```bash
export $(grep -v '^#' .env.test | xargs)
```

---

### Run only the login e2e
```bash
npm run test:e2e -- --runTestsByPath test/e2e/user/login.e2e-spec.ts
# Or a single test by name:
npm run test:e2e -- -t "should login and return access + refresh tokens"
```

### Run the full e2e suite
```bash
npm run test:e2e
```

### Manual curl (when the app is running)
- Start the server (e.g. `npm run start:dev`)
- Login:
```bash
BASE_URL="http://localhost:3000"
curl -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"<your-username>","password":"<your-password>"}'
```
- Call protected route (note: raw token in `Authorization`, no `Bearer `):
```bash
ACCESS="<paste-access-token>"
TENANTID="<optional-tenant-uuid>"
curl -H "Authorization: $ACCESS" -H "tenantid: $TENANTID" "$BASE_URL/auth"
```

---

### Why mocking is used in e2e
External dependencies (Keycloak, RSA verification) can make e2e tests slow and flaky. The e2e spec overrides:
- `KeycloakService.login` to return synthetic tokens
- `JwtAuthGuard` to bypass signature validation

This keeps the test focused on our API contract/flow while remaining fast and deterministic.

---

### Negative cases covered
- Login with invalid username/password:
  - In a separate e2e block we override `KeycloakService.login` to throw with `response.status = 401`. The API responds with a 404 and a failed response envelope (as per `AuthService` + `AllExceptionsFilter`).
- RBAC token endpoint header validation:
  - `GET /auth/rbac/token` without `tenantid` → 400
  - `GET /auth/rbac/token` with non-UUID `tenantid` → 400


