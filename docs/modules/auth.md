# Auth Module

## Module Overview

The Auth module handles user authentication operations including login, logout, token refresh, and user authentication verification. It integrates with Keycloak for authentication.

**Purpose**: Manage user authentication, JWT token operations, and session management.

**Key Entities**: `User` (read; `lastLogin` is updated by `GET /auth`). Authentication itself is stateless.

**Dependencies**:
- Keycloak (via `KeycloakService`, password / refresh_token grants and logout endpoint)
- `UserModule` / `UserService` - For user data retrieval and the `USER_LOGIN` Kafka event
- `@nestjs/throttler` - Per-IP rate limiting on login (see [Login Throttling](#login-throttling))
- `JwtStrategy` (`jwt-keycloak`) and `RbacJwtStrategy` (`jwt-rbac`) registered here (see [common.md](./common.md))

**Related docs**: [Brute force mitigation](../security/brute-force-attack-mitigation.md), [common.md](./common.md), [kafka.md](./kafka.md)

## API Endpoints

### Login - POST `/login`

**API ID**: `api.login`

**Route**: `POST /user/v1/auth/login`

**Authentication**: Not required. Protected by `LoginThrottlerGuard` (5 requests / 60 s per client IP).

**Headers**:
- `x-internal-secret` (optional) - Shared secret that lets internal services skip the throttle (see [Login Throttling](#login-throttling))

**Request Body** (`AuthDto`, both fields `@IsString() @IsNotEmpty()`):
- `username` (string) - Username
- `password` (string) - Password

**Response**:
- **Success (200)**: Standard API envelope; `result` carries the Keycloak token response
  ```json
  {
    "id": "api.login",
    "params": { "status": "successful", "successmessage": "Auth Token fetched Successfully." },
    "responseCode": 200,
    "result": {
      "access_token": "jwt_token",
      "refresh_token": "refresh_token",
      "expires_in": 3600,
      "refresh_expires_in": 1800,
      "token_type": "Bearer"
    }
  }
  ```
- **Error (400)**: Validation failure (missing/empty `username` or `password`)
- **Error (404)**: `Invalid username or password` (Keycloak 401 is mapped to `NotFoundException`)
- **Error (429)**: Throttle limit exceeded (`ThrottlerException: Too Many Requests`)
- **Error (500)**: Any other Keycloak failure, message `Error : <message>`

**Business Logic**:
1. `LoginThrottlerGuard` counts the request against the caller IP (or skips it for a valid `x-internal-secret`)
2. `KeycloakService.login()` calls the Keycloak token endpoint (`grant_type=password`)
3. Returns `access_token`, `refresh_token`, `expires_in`, `refresh_expires_in`, `token_type`

**Edge Cases**:
- Wrong password, unknown username and Keycloak-locked account all produce the same `Invalid username or password` (404) response; this is intentional anti-enumeration behaviour inherited from Keycloak
- Throttle exceeded → 429 before Keycloak is contacted
- Keycloak unavailable → 500 Internal Server Error

**Dependencies**:
- `AuthService.login()`
- `LoginThrottlerGuard`
- Keycloak API

**Side Effects**: None (stateless). Throttle counters are held in process memory.

---

### Get User by Auth - GET `/`

**API ID**: `api.user.auth`

**Route**: `GET /user/v1/auth/`

**Authentication**: Required (`JwtAuthGuard`, strategy `jwt-keycloak`, Bearer token verified against `KEYCLOAK_REALM_RSA_PUBLIC_KEY`)

**Headers**:
- `Authorization: Bearer <token>` (required)
- `tenantid` (optional) - Tenant ID

**Response**:
- **Success (200)**: Authenticated user details (`UserService.findUserDetails`), message `User fetched by auth token Successfully.`
- **Error (401)**: Invalid/expired token (rejected by the guard)
- **Error (500)**: Any failure inside the service (including user lookup failure) is returned as `Internal Server Error`

**Business Logic**:
1. Guard validates the JWT
2. Decodes `preferred_username` from the token
3. Loads user details, optionally scoped by `tenantid`
4. Updates `Users.lastLogin` to the current time (UTC)
5. Sends the response
6. After the response is sent, publishes a `USER_LOGIN` Kafka event (`{ userId, lastLogin }`) fire-and-forget; publish failures are logged and never affect the response

**Edge Cases**:
- Invalid or expired token → 401 Unauthorized
- Kafka disabled or down → login response unaffected

**Dependencies**:
- `AuthService.getUserByAuth()`
- `UserService.findUserDetails()`, `UserService.publishUserEvent('login', ...)`
- `User` repository (`lastLogin` update)

**Side Effects**:
- Updates `lastLogin` on the user row
- Kafka event `USER_LOGIN` (see [kafka.md](./kafka.md))

---

### Refresh Token - POST `/refresh`

**API ID**: `api.refresh`

**Route**: `POST /user/v1/auth/refresh`

**Authentication**: Not required

**Request Body** (`RefreshTokenRequestBody`):
- `refresh_token` (string, required, non-empty) - Refresh token

**Response**:
- **Success (200)**: `result` contains `access_token`, `refresh_token`, `expires_in`, `refresh_expires_in`
- **Error (400)**: Missing/empty `refresh_token`
- **Error (401)**: Invalid or expired refresh token (any Keycloak error is mapped to `UnauthorizedException`)

**Business Logic**:
1. Calls Keycloak token endpoint with `grant_type=refresh_token`
2. Returns the new token pair

**Edge Cases**:
- Invalid refresh token → 401 Unauthorized
- Expired refresh token → 401 Unauthorized

**Dependencies**:
- `AuthService.refreshToken()`
- Keycloak API

**Side Effects**: None

---

### Logout - POST `/logout`

**API ID**: `api.logout`

**Route**: `POST /user/v1/auth/logout`

**Authentication**: Not required

**Request Body** (`LogoutRequestBody`):
- `refresh_token` (string, required, non-empty) - Refresh token to invalidate

**Response**:
- **Success (200)**: `Logged Out Successfully.`
- **Error (401)**: Keycloak answered 400 (invalid/expired refresh token)
- **Error (500)**: Other Keycloak failure

**Business Logic**:
1. Calls the Keycloak OpenID Connect logout endpoint with the refresh token, ending the session
2. Returns success response

**Edge Cases**:
- Invalid refresh token → 401 Unauthorized (not idempotent)
- Keycloak service unavailable → 500 Internal Server Error

**Dependencies**:
- `AuthService.logout()`
- Keycloak API

**Side Effects**: Invalidates tokens in Keycloak

## Login Throttling

`POST /user/v1/auth/login` is the only throttled route. There is no CAPTCHA anywhere in the codebase (no `captchaToken` on `AuthDto`, no reCAPTCHA verification); brute-force protection consists of the two layers below. Full background and status: [docs/security/brute-force-attack-mitigation.md](../security/brute-force-attack-mitigation.md).

| Layer | Where | Behaviour |
|---|---|---|
| Per-IP rate limit | `src/auth/login-throttler.guard.ts`, `ThrottlerModule.forRoot` in `src/auth/auth.module.ts`, `@UseGuards(LoginThrottlerGuard)` on `login` | Named throttler `login`: `limit: 5`, `ttl: 60000` ms. The 6th request from one IP inside the window gets 429. |
| Per-account lockout | Keycloak realm Brute Force Detection (configured in Keycloak, not in this repo) | Temporary lockout after N failed passwords; surfaces as the same generic invalid-credentials response. |

**How the guard works**
- `LoginThrottlerGuard extends ThrottlerGuard` and overrides only `shouldSkip()`.
- Tracker is the default `req.ip`. `app.set("trust proxy", 1)` in `main.ts` makes `req.ip` the first `X-Forwarded-For` hop (see [common.md](./common.md#bootstrap-srcmaints)); the hop count must match the real proxy chain or all clients may share one counter.
- **Internal bypass**: if env `INTERNAL_SERVICE_SECRET` is set and the request header `x-internal-secret` equals it (length check then `crypto.timingSafeEqual`), the request is not counted. If the env var is unset, nobody can skip. Intended for `pratham-microservice` cron/ERP webhook calls.
- Counters live in the throttler default in-memory storage, so they are per pod. With N replicas the effective limit is up to 5 x N per minute per IP.
- Response headers (named-throttler suffix): `X-RateLimit-Limit-login`, `X-RateLimit-Remaining-login`, `X-RateLimit-Reset-login`; on breach also `Retry-After-login`.
- 429 body (via `AllExceptionsFilter(APIID.LOGIN)`):
  ```json
  { "id": "api.login", "params": { "status": "failed", "err": "ThrottlerException", "errmsg": "ThrottlerException: Too Many Requests" }, "responseCode": 429, "result": {} }
  ```

**Example**: a client behind the load balancer at `203.0.113.7` posts bad credentials 5 times in 20 seconds and gets 404 each time; the 6th attempt in the same minute gets 429 without Keycloak being called. A cron job from pratham-microservice sending `x-internal-secret: <INTERNAL_SERVICE_SECRET>` is never counted, however often it logs in.

## Common Issues & Solutions

### Issue: Login returns 429
**Solution**: The caller IP exceeded 5 login requests per 60 s. Wait for the window to pass, or for internal callers send `x-internal-secret`. If many users get 429 at once, check the `trust proxy` hop count in `main.ts` (all clients may be seen as the proxy IP).

### Issue: Login fails with valid credentials
**Solution**: Check Keycloak configuration, user account status, and network connectivity to Keycloak.

### Issue: Token refresh fails
**Solution**: Verify refresh token is valid and not expired. Check Keycloak token settings.

### Issue: User not found after authentication
**Solution**: Ensure user exists in database and matches Keycloak user. Check user synchronization.

### Common Mistakes to Avoid
1. Not handling token expiration gracefully
2. Storing sensitive data in JWT tokens
3. Not validating token signature
4. Missing error handling for Keycloak failures
