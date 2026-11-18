# Common (Cross-Cutting) Module

## Module Overview

`src/common` and a few top-level files hold the pieces every module relies on: authentication guards, request-context middleware, audit logging, the logger, the exception filter, validation pipes, the response envelope, the health endpoint and the application bootstrap.

**Purpose**: Shared infrastructure for authentication, error/response format, auditing, logging and process bootstrap.

**Key Entities**: None.

**Related docs**: [auth.md](./auth.md), [authRbac.md](./authRbac.md), [cache.md](./cache.md), [kafka.md](./kafka.md)

## Bootstrap (`src/main.ts`)

- `NestFactory.create<NestExpressApplication>(AppModule)`, listens on port 3000.
- `app.set("trust proxy", 1)`: trust the first proxy hop so `req.ip` is the client IP from `X-Forwarded-For`. Required for per-IP login throttling ([auth.md](./auth.md#login-throttling)); the hop count must match the real ALB/ingress chain.
- Static files served at `process.env.IMAGEPATH` from `../uploads`.
- Global prefix `user/v1`, with `GET /health` excluded (so health is at `/health`).
- Swagger UI at `/swagger-docs` (API-key scheme `access-token` in the `Authorization` header).
- `app.useGlobalFilters(new AllExceptionsFilter())` and `app.enableCors()` (default, all origins).
- The global `ValidationPipe` is commented out. DTO validation runs only where a controller method applies `@UsePipes(ValidationPipe)`.

## Guards

| Guard | File | Strategy | Behaviour |
|---|---|---|---|
| `JwtAuthGuard` | `guards/keycloak.guard.ts` | `jwt-keycloak` | Bearer token verified with `KEYCLOAK_REALM_RSA_PUBLIC_KEY`, expiry enforced. `req.user = { userId (sub), name, username (preferred_username) }`. |
| `RbacAuthGuard` | `guards/rbac.guard.ts` | `jwt-rbac` | Reads `@Permissions(...)` metadata; token from header `rbac_token`, verified with `RBAC_JWT_SECRET`. No metadata means access is allowed. |
| `RbacJwtStrategy` | `guards/rbac.strategy.ts` | | `admin` role passes; otherwise `iss`/`aud` must match `ISSUER`/`AUDIENCE`, privileges non-empty, and every required permission present, else 401. |
| `LoginThrottlerGuard` | `src/auth/login-throttler.guard.ts` | | Per-IP login throttle, see [auth.md](./auth.md#login-throttling). |

Decorators (`decorators/`): `@Permissions(...perms)` sets metadata; `PERMISSIONS` constants in `permission.config.ts`; `@GetTenantId()` reads and validates the `tenantid` header (400 if missing or not a UUID); `@GetUserId()` decodes `sub` from the Bearer token (401 if absent/invalid).

`src/middleware/permission.middleware.ts` (`PermissionMiddleware`) maps the JWT `user_roles` claim and request path to `RolePermissionService.getPermissionForMiddleware`, returning 403 when the method is not allowed. It is imported in `app.module.ts` but not registered in `configure()`, so it is not active.

## Request Context

`RequestContextMiddleware` (applied to all routes in `AppModule.configure`) runs each request inside an `AsyncLocalStorage` (`utils/request-context.ts`) holding the Express request. Services can read it anywhere without passing the request down; the audit helper uses it.

## Audit Logging

- `AuditLoggerModule.forRoot({ serviceName: AUDIT_SERVICE_NAME || "user-service", kafkaTopic: "audit.events" })` from `@tekdi/audit-logger`.
- `getAuditContext()` (`utils/audit-helper.ts`) returns `{ actorId, actorName, userRole, ipAddress, userAgent }` from the stored request (`req.user`, `req.ip`, `user-agent`). Defaults when no user: actorId `00000000-0000-0000-0000-000000000000`, actorName `System`, userRole `Unknown`.
- Services call `emitAuditSafely({ entityType, entityId, eventAction, ...auditCtx, metadata })`, which wraps `AuditLoggerService.emit` in try/catch so auditing never fails a request.

| entityType | Actions emitted |
|---|---|
| `USER` | `UPDATED`, `USER_CREATED`, `DELETED` |
| `COHORT` | `CREATED`, `UPDATED`, `STATUS_UPDATED`, `DELETED` |
| `COHORT_MEMBER` | `CREATED`, `UPDATED` |
| `USER_TENANT_MAPPING` | `CREATED`, `UPDATED` |
| `ROLE` | `CREATED`, `UPDATED`, `DELETED` |
| `USER_ROLE` | `CREATED`, `UPDATED`, `DELETED` |
| `ROLE_PERMISSION` | `CREATED`, `UPDATED`, `DELETED` |
| `FIELD_VALUE` | `CREATED`, `DELETED` |

Events are emitted after the write succeeds.

## Logger (`logger/LoggerUtil.ts`)

Static winston wrapper writing JSON lines to the console (`timestamp, context, user, level, message, error`). `log`, `error`, `warn`, `debug`. Messages are passed through a sanitizer that redacts `password`, `token`, `secret`, `otp`, `authorization` style key/value pairs. `error()` and `warn()` replace the `error` and `context` values with `[REDACTED_ERROR]` / `[REDACTED_CONTEXT]`.

## Response and Error Format

`APIResponse.success(res, id, result, status, message)` and `APIResponse.error(res, id, errmsg, error, status)` (`responses/response.ts`):

```json
{ "id": "api.login", "ver": "1.0", "ts": "<ISO>",
  "params": { "resmsgid": "<uuid>", "status": "successful|failed", "err": null, "errmsg": null, "successmessage": "..." },
  "responseCode": 200, "result": {} }
```

On failure `params.err` is the error name, `params.errmsg` the message, `result` is `{}`. If building the response throws, a 500 envelope is sent instead.

`AllExceptionsFilter(apiId?)` (`filters/exception.filter.ts`): catches everything; returns early if headers were already sent; `HttpException` keeps its status and uses `exception.message` (or the response `message`) as `errmsg` and the exception class name as `err`; any other exception becomes 500 `Internal server error`. Controllers attach it per route with the route's API ID (`@UseFilters(new AllExceptionsFilter(APIID.X))`); the global instance has no API ID, so `id` is empty. API IDs are in `utils/api-id.config.ts`.

## Pipes

`DateValidationPipe` (`pipes/date-validation.pipe.ts`): for academic years, rejects `startDate` before today and `endDate` not after `startDate` (400).

## Health

`GET /health` (`src/health.controller.ts`, outside the `user/v1` prefix) runs `SELECT 1` and reads `CacheHealthIndicator`. `result.healthy` equals database health only; Redis state is informational ([cache.md](./cache.md#health)).

```json
{ "id": "api.content.health", "responseCode": "OK",
  "result": { "checks": [ { "name": "postgres db", "healthy": true }, { "name": "cache/redis", "healthy": true, "info": { "redis": "ok" } } ], "healthy": true, "cache": { } } }
```

Note: the HTTP status is 200 even when `healthy` is false; probes must read the body.

## Other Shared Pieces

- `database.module.ts`: TypeORM Postgres (`POSTGRES_*` env), auto-loaded entities, pool max 20, idle 30 s, connect timeout 2 s.
- `services/upload-file.ts`, `upload-S3.service.ts`: S3 upload helpers (`AWS_*` env).
- `utils/keycloak.service.ts`, `keycloak.adapter.util.ts`: Keycloak token/admin calls.
- `utils/jwt-token.ts`, `auth-util.ts`, `http-service.ts`, `notification.axios.ts`, `custom-field-validation.ts`, `formatTimeConversion.ts`, `response.messages.ts`.

## Example

`PATCH /user/v1/update/:id` by a Keycloak-authenticated admin: the middleware stores the request, `JwtAuthGuard` sets `req.user`, the service updates the row, invalidates cache, publishes `USER_UPDATED` to Kafka, and calls `emitAuditSafely` where `getAuditContext()` reads the actor from the stored request. A thrown `BadRequestException` is rendered by `AllExceptionsFilter` as `{ params: { status: "failed", err: "BadRequestException", errmsg }, responseCode: 400 }`.
