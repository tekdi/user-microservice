# Permission RBAC Module

## Module Overview

The Permission RBAC module manages role-permission mappings used for API-path level access control. Each mapping says that a role (by title) may call an API path with certain HTTP methods.

**Purpose**: Manage role-permission mappings for detailed access control beyond basic role assignments.

**Key Entities**:
- `RolePermission` (table `RolePermission`) - `rolePermissionId` (uuid), `roleTitle`, `module`, `requestType`, `apiPath`, `createdBy` (uuid), `updatedBy` (uuid), `createdAt`, `updatedAt`

**Dependencies**:
- `@tekdi/audit-logger` (`AuditLoggerService`) and `getAuditContext()` for audit events
- Exported `RolePermissionService` is consumed by `AuthModule` and by `PermissionMiddleware`

Source: `src/permissionRbac/rolePermissionMapping/` (controller, service, `RolePermissionCreateDto`, entity). No Kafka events and no cache are used in this module.

## API Endpoints

Controller route prefix: `role-permission`. The controller has no `JwtAuthGuard` or `RbacAuthGuard`, and the handlers do not declare API ID exception filters. Responses use `APIResponse` with the API IDs below.

**Request DTO** `RolePermissionCreateDto` (no class-validator decorators, so no validation is applied): `roleTitle`, `module`, `apiPath`, `requestType` (string of HTTP methods), optional `rolePermissionId`.

### Create Permission - POST `/role-permission/create`
**API ID**: `api.create.permission`
**Request Body**: `RolePermissionCreateDto` (`roleTitle`, `apiPath`, `requestType`, `module`)
**Response**: HTTP 200, the saved row; 500 "Failed to add permission data." on error
**Side Effects**: Audit event `ROLE_PERMISSION` / `CREATED` (`entityId` = `rolePermissionId`)

### Get Permission - POST `/role-permission/get`
**API ID**: `api.get.permission`
**Business Logic**: Finds rows where `roleTitle` and `apiPath` match. The handler declares `roleTitle` and `apiPath` as separate `@Body()` parameters of type string, so each receives the whole request body object rather than the individual field.
**Response**: Array of matching rows

### Update Permission - POST `/role-permission/update`
**API ID**: `api.update.permission`
**Request Body**: `RolePermissionCreateDto` with `rolePermissionId` identifying the row; `roleTitle`, `apiPath`, `requestType`, `module` are overwritten
**Response**: TypeORM update result
**Side Effects**: Audit event `ROLE_PERMISSION` / `UPDATED`

### Delete Permission - DELETE `/role-permission/delete`
**API ID**: `api.delete.permission`
**Request Body**: `rolePermissionId` (declared as a string `@Body()` parameter)
**Response**: TypeORM delete result
**Side Effects**: Audit event `ROLE_PERMISSION` / `DELETED`

Audit emission goes through `emitAuditSafely`, which catches and logs failures. For create/update/delete the audit event is emitted after the success response object is built and does not affect the HTTP outcome.

## Permission Lookup for Middleware

`RolePermissionService.getPermissionForMiddleware(roleTitle, apiPath)` returns the `RolePermission` rows for a role and path. It is used by `PermissionMiddleware` (`src/middleware/permission.middleware.ts`), which derives the role from the `user_roles` claim of the bearer token (or `public` when no `Authorization` header), converts the request path to a wildcard path (`/a/b/*` for 3 segments, `/a/b/c/*` for more), and allows the request when some row's `requestType` contains the HTTP method. `AppModule.configure` applies only `RequestContextMiddleware`, so `PermissionMiddleware` is not currently mounted.

## Relationship to Privilege-Based Guards

Path permissions in this module are separate from privilege codes (`Privileges`/`RolePrivilegesMapping`, see `rbac.md`) that `RbacAuthGuard` with `@Permissions(...)` checks against the `rbac_token`. See "Permission Guard and Decorator" in `rbac.md`.

## Common Issues & Solutions

### Issue: Permissions not applied to role
**Solution**: Verify a `RolePermission` row exists with the exact `roleTitle` and `apiPath` (wildcard form such as `/user/v1/*`), and that `requestType` includes the HTTP method. Note the middleware must be registered for rows to be enforced.

### Common Mistakes to Avoid
1. Not creating role-permission mappings
2. Using a concrete path instead of the wildcard form for non-public roles
3. Omitting `rolePermissionId` on update
