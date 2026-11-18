# User Tenant Mapping Module

## Module Overview

The User Tenant Mapping module manages the relationship between users and tenants. It handles assignment of a user to a tenant with a role, status management (active, inactive, archived, pending), and retrieval of a user's tenant relationships.

**Purpose**: Manage user-tenant associations with status tracking and multi-tenancy support.

**Key Entities**:
- `UserTenantMapping` - Maps users to tenants with status (`Id`, `userId`, `tenantId`, `status`, `reason`, `createdBy`, `updatedBy`, timestamps). Status enum: `active` (default), `inactive`, `archived`, `pending`
- `UserRoleMapping` - Role of the user in the tenant (written together with the mapping)
- `Tenants` - Tenant entity

**Dependencies**:
- `UserService` - `assignUserToTenantAndRoll()` writes the role and tenant rows and invalidates caches; `validateCustomField()` validates custom fields
- `FieldsService` - Custom field persistence
- `KafkaService` - Event publishing
- `CacheService` - `usertenant:{userId}` cache
- `AuditLoggerService` - Audit events

All routes are under the `user-tenant` controller prefix, so the full path is `/user/v1/user-tenant...`. The controller applies `JwtAuthGuard` to every route.

## API Endpoints

### Create User-Tenant Mapping - POST `/user-tenant`

**API ID**: `api.assigntenant.create`

**Route**: `POST /user/v1/user-tenant`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`UserTenantMappingDto`):
```typescript
{
  userId: string;   // Required, UUID
  tenantId: string; // Required, UUID
  roleId: string;   // Required, UUID
  userTenantStatus?: "active" | "inactive" | "archived" | "pending"; // Default "active"
  customField?: { fieldId: string; value: any }[]; // Optional
}
```

**Response**:
- **Success (200)**: `result` is `{ userId, tenantId, roleId, message, createFailures? }`
- **Error (400)**: Validation failure. The first error is returned as `User not added to tenant: <reason>` (user, tenant or role does not exist, user already has this role in the tenant, custom field invalid)
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate body (`ValidationPipe`)
2. `validateUserTenantMapping()` loads user, tenant, existing role mapping for (user, tenant, role) and the role in parallel and rejects in this order: user missing, tenant missing, role already assigned in that tenant, role missing; then validates `customField` through `UserService.validateCustomField`
3. Call `UserService.assignUserToTenantAndRoll(data, callerUserId, true)`, with `userTenantStatus` defaulting to `active`. With the last argument `true`:
   - If the user's existing role/tenant row belongs to a **root tenant** (`parentId = null`), that row is rewritten to the new tenant (and role / status) instead of a new row being inserted
   - Otherwise a role mapping is inserted. For the tenant mapping: if (user, tenant) already exists and is `active` nothing changes; if it exists with another status it takes the supplied status; if it does not exist it is created
   - Caches are invalidated: `user:{userId}`, `usertenant:{userId}`, `userroles:{userId}`, `userlist:{tenantId}`
4. Emit audit event `USER_TENANT_MAPPING` / `CREATED` (`metadata.tenantId`)
5. If `customField` is present, save values (context `USER`, tenant-scoped, `createdBy`/`updatedBy` = caller) and invalidate `user:{userId}`, `ufields:{userId}`, `userfilter`
6. Send the response, then publish the Kafka event

**Kafka**: `publishUserTenantMappingEvent('created', { userId, tenantId, roleId, status }, apiId)` → `KafkaService.publishUserTenantEvent` → event type `USER_TENANT_MAPPING` on `KAFKA_TOPIC` (default `user-topic`), key `userId`. `data` contains `userId`, `tenantId`, `status`, `createdAt`, `updatedAt`, `user` (username, names, email, mobile), `tenant` (name, domain), `role` (`roleId`, `code`, `title` for the role passed in `roleId`), `customFields`, `eventTimestamp`. The method now takes a single `eventData` object instead of separate user/tenant arguments (commit `062a7fa1`); `roleId` is required in it for the role lookup. Failures are logged and never affect the response.

**Edge Cases**:
- Same user, tenant and role already mapped → 400
- Non-existent user, tenant or role → 400

**Side Effects**:
- Creates / updates `UserRoleMapping` and `UserTenantMapping` rows, custom field values
- Cache invalidation, audit event, Kafka event

Example: `{"userId":"u1","tenantId":"t2","roleId":"r1","userTenantStatus":"pending"}` creates the (u1, t2) mapping with status `pending` and role `r1`, then publishes `USER_TENANT_MAPPING`.

---

### Get User-Tenant Mappings - GET `/user-tenant/:userId`

**API ID**: `API-USER-TENANT-MAPPING-GET` (literal string in the service, not in `APIID`)

**Route**: `GET /user/v1/user-tenant/:userId`

**Authentication**: Required (`JwtAuthGuard`)

**Path Parameters**:
- `userId` (required, UUID; `ParseUUIDPipe`)

**Query Parameters**:
- `includeArchived` (optional) - `"true"` to include `archived` mappings (default excluded)

**Response**:
- **Success (200)**: `result` is `{ mappings, totalCount }`; each mapping has `mappingId`, `userId`, `tenantId`, `status`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `tenantName`, `tenantDomain`, `tenantStatus`, ordered by `createdAt` DESC
- **Error (404)**: No mappings found
- **Error (400)**: Invalid `userId`
- **Error (500)**: Internal Server Error

**Business Logic**: SQL join of `UserTenantMapping` and `Tenants`, wrapped in `cacheService.getOrLoad` (namespace `usertenant:{userId}`, key `mappings:all|active`, TTL 600 s). An empty result is not cached, so a fresh assignment appears at once. The namespace is bumped by mapping create/status update, user create and user delete.

---

### Update User-Tenant Status - PATCH `/user-tenant/status`

**API ID**: `api.assigntenant.updatestatus`

**Route**: `PATCH /user/v1/user-tenant/status?userId=<uuid>&tenantId=<uuid>`

**Authentication**: Required (`JwtAuthGuard`)

**Query Parameters**: `userId` (required, UUID), `tenantId` (required, UUID); both parsed with `ParseUUIDPipe`

**Request Body** (`UpdateAssignTenantStatusDto`):
```typescript
{
  status: "active" | "inactive" | "archived" | "pending"; // Required
  reason?: string; // Optional
}
```

**Response**:
- **Success (200)**: `result` is `{ userId, tenantId, status, reason, message }`
- **Error (400)**: Invalid query ids or body
- **Error (404)**: Mapping not found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Find the (userId, tenantId) mapping; 404 if missing
2. Set `status`, `updatedBy` = caller, `updatedAt`; set `reason` only when provided (an omitted reason keeps the old one)
3. Invalidate `user:{userId}`, `usertenant:{userId}`, `userlist:{tenantId}`
4. Emit audit event `USER_TENANT_MAPPING` / `UPDATED` (entityId = mapping `Id`)
5. Send the response, then publish `publishUserTenantMappingEvent('updated_status', { userId, tenantId, status }, apiId)` → `USER_TENANT_STATUS_UPDATE` with `data` = `Id, userId, tenantId, status, reason, createdAt, updatedAt, createdBy, updatedBy` read fresh from the table

**Side Effects**: Updates the mapping; cache invalidation; audit and Kafka events. Note this endpoint changes only the mapping status, not `Users.status`.

---

## Common Issues & Solutions

### Issue: User not appearing in tenant
**Solution**: Verify the mapping exists with `active` status (`GET /user-tenant/:userId?includeArchived=true`). Check tenant filtering in queries; the `userlist:{tenantId}` cache is bumped on mapping changes.

### Issue: Status update fails
**Solution**: Ensure the mapping exists for that exact (userId, tenantId) and the status is one of active, inactive, archived, pending.

### Issue: Assigning a tenant moved the user out of the root tenant
**Solution**: This is intended: when the user's existing mapping is in a root tenant, the create call rewrites it to the new tenant rather than adding a second row.

### Common Mistakes to Avoid
1. Calling the old paths (`/userTenantMapping/create`, `/updateStatus`); the routes are `/user-tenant`, `/user-tenant/:userId`, `/user-tenant/status`
2. Sending status as `userTenantStatus` on update (the update body field is `status`)
3. Not checking mapping existence before update
4. Not filtering by tenant in queries
