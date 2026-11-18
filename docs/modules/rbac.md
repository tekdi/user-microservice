# RBAC Module

## Module Overview

The RBAC (Role-Based Access Control) module manages roles, privileges, and their assignments to users. It includes role management, privilege management, user-role assignments (single, delete and bulk update), and role-privilege mappings.

**Purpose**: Manage roles, privileges, and access control assignments with support for tenant-specific roles and permissions.

**Key Entities**:
- `Role` (table `Roles`) - Role definitions. `title` maps to column `name`; `code` is derived from the title; `tenantId` is nullable for global roles
- `Privilege` (table `Privileges`) - Privilege definitions (`title` maps to column `name`, plus `code`)
- `UserRoleMapping` (table `UserRolesMapping`) - User-role assignments: `userRolesId`, `userId`, `tenantId`, `roleId`, `createdBy`, `updatedBy`, timestamps
- `RolePrivilegeMapping` (table `RolePrivilegesMapping`) - Role-privilege mappings

**Dependencies**:
- `CacheService` (`src/cache`) - Redis-backed cache for the user-role read and invalidation on every role change. See `docs/CACHING_STRATEGY.md`
- `@tekdi/audit-logger` (`AuditLoggerService`) - Audit events for role and user-role changes
- `getAuditContext()` (`@utils/audit-helper`) - Supplies `actorId` used for `createdBy` / `updatedBy`

There is no role hierarchy: roles are flat, and no parent/child relationship exists in the entities or services. (The "hierarchy" in the user module is the user/cohort hierarchy view, unrelated to RBAC.) The RBAC module does not publish Kafka events.

**Authentication**: All controllers in this module use `JwtAuthGuard` (Keycloak JWT in `Authorization`). They do not use `RbacAuthGuard` or the `@Permissions` decorator; see "Permission Guard and Decorator" below.

**Response format**: All endpoints respond through `APIResponse.success/error` with the API ID shown for each endpoint. Exceptions are mapped by `AllExceptionsFilter` using the same API ID.

## API Endpoints

### Role Management

Controller: `src/rbac/role/role.controller.ts`, base route `rbac/roles`.

#### Get Role - GET `/rbac/roles/read/:id`
**API ID**: `api.role.get`
**Authentication**: Required (`JwtAuthGuard`)
**Headers**: `tenantid` (documented in Swagger, not enforced)
**Path Param**: `id` - role UUID (validated with `ParseUUIDPipe`; invalid UUID returns 400)
**Response**: `{ roles: Role[], totalCount }` - `roles` is empty when the role does not exist (no 404)

#### Create Role - POST `/rbac/roles/create`
**API ID**: `api.role.create`
**Authentication**: Required
**Headers**: `tenantid` (documented, not enforced; the tenant comes from the body)
**Request Body**: `CreateRolesDto`
- `tenantId` (optional) - UUID of the tenant, or empty/blank for a global role
- `roles[]` - each `RoleDto` with required `title`

**Business Logic**:
1. If `tenantId` is non-blank and not a UUID, return 400 "Invalid Tenant Id".
2. If it is a UUID, check the `Tenants` table; missing tenant returns 404 "Tenant Id not found".
3. For each role, `code = title.toLowerCase()` with whitespace replaced by `_`.
4. If a role with the same `code` and `tenantId` (or `tenantId IS NULL` for global roles) exists, the item is added to `errors` and skipped.
5. Otherwise the role is saved with `createdBy`/`updatedBy` set to the audit actor.

**Response**: HTTP 200, `{ successCount, errorCount, roles: [{ roleId, title, code }], errors }`
**Side Effects**: Audit event `ROLE` / `CREATED` per saved role (`entityId` = `roleId`, metadata `tenantId`). No cache invalidation (no role-definition cache exists).
**Example**: Body `{ "tenantId": "<tenant-uuid>", "roles": [{ "title": "Center Admin" }] }` creates a role with `code` `center_admin`. Sending the same body again returns `successCount: 0`, `errorCount: 1`.

#### Update Role - PUT `/rbac/roles/update/:id`
**API ID**: `api.role.update`
**Authentication**: Required
**Request Body**: `RoleDto` (`title` is used; `code` is re-derived from `title`)
**Response**: `{ rowCount }` (affected rows; 0 when the role does not exist, no 404)
**Side Effects**: Audit event `ROLE` / `UPDATED` (`entityId` = role id). No cache invalidation.
**Edge Cases**: `:id` is not validated as a UUID here; an invalid value surfaces as a 500 from the database.

#### Search Roles - POST `/rbac/roles/list/roles`
**API ID**: `api.role.search`
**Authentication**: Required
**Request Body**: `RoleSearchDto` - `limit` (numeric string), `page`, `filters` (object)
**Supported filter combinations** (anything else returns 400 "Invalid Filter"):

| Filters | Result |
|---|---|
| `tenantId` | Roles of the tenant (`roleId`, `title`, `code`) |
| `tenantId` + `field: "Privilege"` | Roles of the tenant, each with its privileges |
| `userId` + `tenantId` | Roles assigned to the user in the tenant |
| `userId` + `tenantId` + `field: "Privilege"` | The user's roles, each with privileges |

**Edge Cases**: `userId` without `tenantId` returns 400. `field` accepts only `"Privilege"`. `limit`/`page` are parsed but the role queries do not apply them, so results are not paginated.

#### Delete Role - DELETE `/rbac/roles/delete/:roleId`
**API ID**: `api.role.delete`
**Authentication**: Required
**Business Logic**:
1. Non-UUID returns 400; unknown role returns 404.
2. Read the `userId`s in `UserRolesMapping` that hold this role (needed before the cascade, to know which caches to invalidate).
3. Delete the role, then delete its `RolePrivilegesMapping` and `UserRolesMapping` rows.

**Response**: `{ rowCount }`
**Side Effects**:
- Audit event `ROLE` / `DELETED`
- Cache invalidation: `user:{userId}` and `userroles:{userId}` for every affected user, and `userlist:{tenantId}` when the role has a tenant

### Privilege Management

Controller: `src/rbac/privilege/privilege.controller.ts`, base route `rbac/privileges`. All routes use `JwtAuthGuard`. The service does not emit audit events or touch the cache.

#### Get Privileges by Role ID - GET `/rbac/privileges?tenantId=<uuid>&roleId=<uuid>`
**API ID**: `api.privilegebyRoleId.get`
**Query**: `tenantId`, `roleId` (both required UUIDs; otherwise 400)
**Business Logic**: The `roleId`/`tenantId` pair must exist in `Roles` (otherwise 400 "Invalid combination"), then privileges are read by joining `RolePrivilegesMapping` and `Privileges`.
**Response**: Array of privileges

#### Get Privilege by Privilege ID - GET `/rbac/privileges/:privilegeId`
**API ID**: `api.privilegebyPrivilegeId.get`
**Response**: Privilege details; 400 for non-UUID, 404 if not found

#### Create Privilege - POST `/rbac/privileges/create`
**API ID**: `api.privilege.create`
**Request Body**: `CreatePrivilegesDto` with a `privileges[]` array; duplicates (same `code`) are reported in `errors`
**Response**: HTTP 201, `{ successCount, errorCount, privileges, errors }`

#### Delete Privilege - DELETE `/rbac/privileges/:privilegeId`
**API ID**: `api.privilege.delete`
**Response**: `{ rowCount }`; 404 if not found. Also deletes the privilege's `RolePrivilegesMapping` rows.

### User-Role Assignment

Controller: `src/rbac/assign-role/assign-role.controller.ts`, base route `rbac/usersRoles`. Service: `assign-role.service.ts`.

#### Assign Roles to User - POST `/rbac/usersRoles`
**API ID**: `api.userRole.create`
**Authentication**: Required
**Request Body**: `CreateAssignRoleDto`

| Field | Type | Validation |
|---|---|---|
| `tenantId` | string | `@IsUUID()` |
| `userId` | string | `@IsUUID()` |
| `roleId` | string[] | array of UUIDs, each non-empty |

**Business Logic** (per role in `roleId`):
1. Empty `roleId` array returns 400.
2. Skip (add to `errors`) if the user already holds that role. This check is on `userId` + `roleId` only, not on tenant.
3. Skip (add to `errors`) if the role does not exist for the given `tenantId` (`Roles` row with that `roleId` and `tenantId`).
4. Otherwise save a `UserRolesMapping` row with `createdBy`/`updatedBy` = audit actor.

If nothing was saved, returns 400 "Please Enter Valid User ID" (even when the cause was "already assigned"). FK violation (`23503`) returns 404.

**Response**: HTTP 201, `{ successCount, errorCount, result: [{ userId, roleId, tenantId, message }], errors }`
**Side Effects**:
- Audit event `USER_ROLE` / `CREATED` per saved row (`entityId` = `userRolesId`, metadata `tenantId`). Emission is wrapped in `emitAuditSafely`; a failure is logged and never fails the request.
- Cache invalidation: `user:{userId}`, `userroles:{userId}`, `userlist:{tenantId}`

#### Get User Roles - GET `/rbac/usersRoles/:userId`
**API ID**: `api.userRole.get`
**Authentication**: Required
**Business Logic**: Non-UUID returns 400. Reads through the cache (`namespace userroles:{userId}`, key `role`, TTL 600 s) with `getOrLoad`; the loader is `userRoleMappingRepository.findOne({ userId })`. No result returns 404.
**Response**: A single `UserRolesMapping` row (the first match, not the full list of the user's roles)
**Edge Cases**: The cache key has no tenant component because this read has no tenant filter and the delete path has no `tenantId`.

#### Delete User Roles - DELETE `/rbac/usersRoles/:userId`
**API ID**: `api.userRole.delete`
**Authentication**: Required
**Request Body**: `DeleteAssignRoleDto` - `userId` (string), `roleId` (string[]). The body `userId` is used; the `:userId` path segment is ignored by the handler.
**Business Logic**:
1. `userId` and every `roleId` must be UUIDs (400).
2. The user must have at least one mapping (400 "User not found").
3. Every requested `roleId` must be assigned to the user, otherwise nothing is deleted (400 "Roles not found").
4. Delete the matching `UserRolesMapping` rows.

**Response**: `{ rowCount }`
**Side Effects**:
- Cache invalidation: `user:{userId}`, `userroles:{userId}`, and `userlist:{tenantId}` for each distinct tenant of the deleted mappings (the DTO has no tenant, so tenants are read from the rows being deleted)
- Audit event `USER_ROLE` / `DELETED` per role (`entityId` = `User:{userId}|Role:{roleId}`, metadata `userId`, `roleId`)

#### Bulk Update User Roles - PATCH `/rbac/usersRoles/bulkUpdate`
**API ID**: `api.userRole.bulkUpdate`
**Authentication**: Required
**Headers**: `tenantid` (required; missing returns 400 "Tenant ID is required.")
**Request Body**: `BulkAssignRoleDto` (validated with `whitelist` and `transform`)

| Field | Type | Validation |
|---|---|---|
| `userIds` | string[] | array, non-empty, each a UUID v4 |
| `roleId` | string | UUID, non-empty |

**Business Logic**: For each `userId`, find an existing `UserRolesMapping` for `userId` + `tenantId`. If none, add `{ userId, error }` to `errors` and continue. Otherwise update **all** of that user's mappings in the tenant to `roleId` with `updatedBy` = the caller's id (`@GetUserId("userId", ParseUUIDPipe)` from the token). This replaces the role; it does not add one. If no user was updated, returns 404.
**Response**: `{ updatedCount, updated: [userId], errorCount, errors }`
**Side Effects**:
- Audit event `USER_ROLE` / `UPDATED` per updated user (`entityId` = `User:{userId}|Tenant:{tenantId}`, metadata `userId`, `tenantId`, `roleId`)
- Cache invalidation: `user:{id}` and `userroles:{id}` for every updated user, plus `userlist:{tenantId}`
**Example**: `{ "userIds": ["u1", "u2"], "roleId": "r9" }` with header `tenantid: t1`. If `u1` has a mapping in `t1` and `u2` has none, `u1` is switched to `r9`; response is `updatedCount: 1`, `errorCount: 1` with `u2` in `errors`.

### Assign Privilege

Controller: `src/rbac/assign-privilege/assign-privilege.controller.ts`, base route `assignprivilege` (no `rbac/` prefix). The routes `POST /assignprivilege` (`CreatePrivilegeRoleDto`: `privilegeId[]`, `roleId`, delete-previous flag) and `GET /assignprivilege/:roleid` are declared with `JwtAuthGuard`, but the controller has no service wired in and the handlers throw "Service not yet implemented". They are not usable; role-privilege rows can only be read through `GET /rbac/privileges` and the role search `field: "Privilege"` option.

## Cache Invalidation Summary

| Operation | Keys invalidated |
|---|---|
| Assign roles | `user:{userId}`, `userroles:{userId}`, `userlist:{tenantId}` |
| Delete user roles | `user:{userId}`, `userroles:{userId}`, `userlist:{tenantId}` for each tenant of the deleted rows |
| Bulk update | `user:{id}`, `userroles:{id}` per updated user, `userlist:{tenantId}` |
| Delete role | `user:{id}`, `userroles:{id}` per affected user, `userlist:{tenantId}` if the role is tenant-scoped |

Role create, role update and all privilege operations do not invalidate anything.

## Audit Logging

Entity types emitted by this module: `ROLE` (CREATED, UPDATED, DELETED) and `USER_ROLE` (CREATED, UPDATED, DELETED). Events are sent through `AuditLoggerService.emit` inside `emitAuditSafely`, which catches and logs errors so auditing never breaks the request. Actor and request context come from `getAuditContext()`.

## Permission Guard and Decorator

`RbacAuthGuard` (`src/common/guards/rbac.guard.ts`) uses the `jwt-rbac` Passport strategy (`rbac.strategy.ts`), which reads a second token from the `rbac_token` header. The `@Permissions(...codes)` decorator (`src/common/decorators/permission.decorator.ts`) sets the required privilege codes on the handler. When a handler has no `@Permissions` metadata the guard allows the request. With metadata, the strategy verifies the token (`RBAC_JWT_SECRET`, `ISSUER`, `AUDIENCE`); users whose `userData.roles` contains `admin` pass, others must hold every required privilege code in `userData.privileges`. Currently only `AppController.getHello` (`GET /`) uses `RbacAuthGuard`; the `RbacAuthGuard` import in `cron.controller.ts` is not applied. The RBAC controllers rely on `JwtAuthGuard` only.

## Common Issues & Solutions

### Issue: Role not appearing in tenant
**Solution**: Ensure the role was created with the correct `tenantId` in the body of `POST /rbac/roles/create`. A blank `tenantId` creates a global role (`tenantId` null), which does not match tenant-filtered search.

### Issue: Role assignment reports "not exist for this tenant"
**Solution**: `POST /rbac/usersRoles` checks that the role belongs to the `tenantId` in the body. Verify via `POST /rbac/roles/list/roles` with `filters: { tenantId }`.

### Issue: User still shows old roles after a change
**Solution**: Role assignment endpoints invalidate `user:*`, `userroles:*` and `userlist:*`. If the change was made directly in the database or via an endpoint outside this module, the cache is stale until its TTL (`userroles` is 600 s).

### Common Mistakes to Avoid
1. Not providing `tenantId` for tenant-specific roles
2. Sending `tenantid` header but not `tenantId` in the body for assign/create (the body field is what is validated)
3. Expecting bulk update to add a role; it overwrites the role of every mapping the user has in that tenant
4. Calling `/assignprivilege` endpoints, which are not implemented
