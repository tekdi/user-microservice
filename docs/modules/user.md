# User Module

## Module Overview

The User module is the core module of the microservice, responsible for managing user accounts, profiles, authentication-related operations, and user lifecycle management. It handles user creation, updates, deletion, search, password management, OTP operations, and hierarchical user views.

**Purpose**: Centralized user management with support for multi-tenancy, custom fields, cohort assignments, role mappings, and authentication integration.

**Key Entities**:
- `User` - Core user entity with profile information
- `UserTenantMapping` - Maps users to tenants with status
- `UserRoleMapping` - Maps users to roles
- `CohortMembers` - Maps users to cohorts
- `FieldValues` - Custom field values for users

**Dependencies**:
- `FieldsModule` - For custom field management
- `RoleModule` - For role management
- `AcademicyearsModule` - For academic year context
- `CohortAcademicYearModule` - For cohort-academic year mappings
- `KafkaModule` - For event publishing
- `AutomaticMemberModule` - For automatic member assignment
- `UploadS3Service` - For file uploads
- `NotificationRequest` - For sending notifications
- `JwtUtil` - For JWT token operations
- `AuthUtils` - For authentication utilities
- `CacheService` - For versioned-namespace caching of read APIs (see Caching below and `docs/CACHING_STRATEGY.md`)
- `AuditLoggerService` (`@tekdi/audit-logger/nestjs`) - For audit events on create, update and delete
- `TenantsRepository` - For tenant, parent-tenant and domain lookups

## Database Schema

### User Entity
- `userId` (UUID, Primary Key)
- `username` (String, Unique)
- `firstName`, `lastName` (String, max 50, required), `middleName` (String, max 50, nullable)
- `name` (String, max 100, nullable)
- `gender` (Enum: male, female, transgender)
- `enrollmentId` (String, max 50, required)
- `dob` (Date, nullable)
- `email` (String, nullable)
- `address`, `pincode` (String, nullable)
- `mobile` (Number, nullable)
- `deviceId` (String array, nullable)
- `temporaryPassword` (Boolean, default: true)
- `createdBy`, `updatedBy` (String, nullable)
- `status` (Enum: active, inactive, archived, default: active)
- `reason` (String, nullable)
- `lastLogin` (Timestamp, nullable)
- `createdAt`, `updatedAt` (Timestamp)

### Indexes

Created by migrations in `migrations/`:

| Index | Definition | Migration | Used by |
|---|---|---|---|
| `idx_users_name_trgm` | GIN `name gin_trgm_ops` (requires `pg_trgm`, created by the migration) | `1749513600000-AddTrgmIndexOnUsersNameAndUsername` | `ILIKE '%term%'` on `name` in `POST /list` (`filters.search`, `filters.name`) and `POST /hierarchical-search` (`filters.name`) |
| `idx_users_username_trgm` | GIN `username gin_trgm_ops` | same | `ILIKE '%term%'` on `username` in `POST /list` `filters.search` |
| `idx_users_username_lower_prefix` | btree `LOWER(username) text_pattern_ops`, created `CONCURRENTLY` (migration runs with `transaction = false`) | `1761600000000-AddLowerUsernameIndexOnUsers` | `LOWER(username) LIKE 'prefix%'` in `POST /suggestUsername` |

Example: searching `filters.search = "ram"` becomes `(U.name ILIKE '%ram%' OR U.username ILIKE '%ram%')`; both predicates are served by the trigram indexes instead of a sequential scan.

### Relationships
- `User` → `UserTenantMapping` (OneToMany)
- `User` → `UserRoleMapping` (OneToMany)
- `User` → `CohortMembers` (via userId)
- `User` → `FieldValues` (via itemId)

## Cross-Cutting Behaviour

### Caching

User APIs use `CacheService.getOrLoad()` with versioned namespaces (invalidate = bump a version counter, see `docs/CACHING_STRATEGY.md`). Cache is a pass-through when `CACHE_ENABLED=false` or Redis is unavailable.

| API | Namespace / key | TTL | Notes |
|---|---|---|---|
| `GET /read/:userId` | `user:{userId}`, key `core:{tenantId}`, depends on `ufields:{userId}` | 15 min (`USER_CORE_TTL_SECONDS = 900`) | Caches only the core row + role pair. The existence check (`usersRepository.find`) and custom fields (`getCustomFieldDetails`) always run live. A missing user is never cached. |
| `POST /list` | `userlist:{tenantId}`, key = hash of (`UserSearchDto`, `includeCustomFields`) | 3 min (`USERLIST_TTL_SECONDS = 180`) | Cache is **skipped** when the tenant is empty (domain-email lookup from `/users-hierarchy-view` passes none), or when `filters.search` or `filters.firstName` is present (high-cardinality free text). `false` (no result) is never cached. |
| `POST /hierarchical-search` | not cached | - | Runs the live optimized SQL every call. |
| `/check`, `/suggestUsername`, OTP, password and presigned-url flows | not cached | - | |

Invalidation (all via `cacheService.invalidate`, which bumps the namespace version on all pods):
- `PATCH /update/:userid`: `ufields:{id}` (if custom fields changed); then `user:{id}`, `userfilter` and `userlist:{t}` for **every** tenant the user maps to.
- `POST /create`: `ufields:{id}` and `userfilter` when custom fields were written; tenant/role mapping writes (`assignUserToTenantAndRoll`) bump `user:{id}`, `usertenant:{id}`, `userroles:{id}` and `userlist:{tenantId}`.
- `DELETE /delete/:userId`: `user`, `ufields`, `usertenant`, `userroles`, `userfilter` and `userlist:{t}` for every tenant read before the mappings were deleted.

Example: user A is listed via `POST /list` (cached under `userlist:T1`). `PATCH /update/A` bumps `userlist:T1`; the next `/list` call misses the cache and returns the updated name. A `/list` call with `filters.search = "ram"` never touches the cache at all.

### Audit Logs

`emitAuditSafely()` wraps `AuditLoggerService.emit()` in try/catch so a failing audit sink never fails the request. Context (actor, IP, etc.) is merged from `getAuditContext()`.

| Action | `entityType` / `eventAction` | `metadata` |
|---|---|---|
| Create user | `USER` / `USER_CREATED` | `username`, `email`, `roles` (roleIds from `tenantCohortRoleMapping`), `tenantId` (first mapping) |
| Update user | `USER` / `UPDATED` | `tenantId`, `updatedFields` (the full `userData` payload) |
| Delete user | `USER` / `DELETED` | none |

### Kafka Events

Published fire-and-forget **after** the HTTP response is built (`publishUserEvent(eventType, userId, apiId)`); failures are logged and never affect the response. No-op when Kafka is disabled. Topic is `KAFKA_TOPIC` (default `user-topic`); message key is `userId`. Payload shape: `{ eventType, timestamp, userId, data }`.

| Trigger | `eventType` | `data` |
|---|---|---|
| `POST /create` | `USER_CREATED` | Core user fields (`userId, username, firstName, name, middleName, lastName, gender, dob, mobile, email, createdAt, updatedAt, status, enrollmentId`), `tenantData`, `customFields`, `cohorts` (batch / parent cohort / active academic year details), `eventTimestamp` |
| `PATCH /update/:userid` | `USER_UPDATED` | Same as created |
| `DELETE /delete/:userId` | `USER_DELETED` | `{ userId, deletedAt }` |
| Login (published by the auth module) | `USER_LOGIN` | `{ userId, lastLogin }` |

If the DB fetch for the payload fails, the event is still sent with `data = { userId }`.

User-tenant mapping events (`USER_TENANT_MAPPING`, `USER_TENANT_STATUS_UPDATE`) are documented in `userTenantMapping.md`.

## API Endpoints

### Get User - GET `/read/:userId`

**API ID**: `api.user.get`

**Route**: `GET /user/v1/read/:userId`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required) - Tenant ID for filtering
- `Authorization` (required) - JWT token

**Query Parameters**:
- `fieldvalue` (optional, string) - Set to "true" to include custom fields

**Path Parameters**:
- `userId` (required, UUID) - User ID to retrieve

**Request**: None (GET request)

**Response**:
- **Success (200)**: User details with optional custom fields
  ```json
  {
    "id": "api.user.get",
    "ver": "1.0",
    "ts": "2024-01-01T00:00:00.000Z",
    "params": {
      "resmsgid": "uuid",
      "status": "successful",
      "successmessage": "User retrieved successfully"
    },
    "responseCode": 200,
    "result": {
      // User data with optional custom fields
    }
  }
  ```
- **Error (400)**: Bad Request - Missing tenantId
- **Error (404)**: User Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `tenantId` from headers (required)
2. Extract `userId` from path parameter
3. Parse `fieldvalue` query parameter (default: false)
4. Call `userService.getUsersDetailsById()` with:
   - `context`: "USERS"
   - `tenantId`: from headers
   - `userId`: from path
   - `fieldValue`: boolean from query param
5. Service validates `userId` is a UUID, then checks the user exists (`Users` table, always live)
6. Core row and role are loaded through `getCachedUserCoreRow()` (cache namespace `user:{userId}`, 15 min TTL; see Caching). The role is the tenant-scoped role from `findUserRoles(userId, tenantId)`
7. If `fieldValue` is true, custom fields are loaded with `fieldsService.getCustomFieldDetails(userId, 'Users')` (uncached here, but served from `ufields:{userId}` inside the fields service) and returned as `userData.customFields`
8. Returns `{ userData: {...} }`

**Edge Cases**:
- Missing `tenantId` header → 400 Bad Request (body `{ statusCode: 400, error: "Please provide a tenantId." }`, not the standard envelope)
- Invalid `userId` format → 400 Bad Request (handled by `ParseUUIDPipe`)
- User not found → 404 Not Found
- Unlike other tenant-aware endpoints, a user who exists but has no mapping in the given tenant is still returned (role is simply absent); tenant membership is not enforced here

**Dependencies**:
- `UserService.getUsersDetailsById()`
- `FieldsService` (if custom fields requested)

**Side Effects**: None

---

### Create User - POST `/create`

**API ID**: `api.user.create`

**Route**: `POST /user/v1/create`

**Authentication**: `JwtAuthGuard` is not applied (commented out). Authorization is enforced inside the service by role: an access token is **required when any requested role is not `learner`** (see Business Logic step 5). Learner self-registration needs no token.

**Headers**:
- `academicyearid` (optional) - Academic Year ID. Required whenever any mapping carries `cohortIds`
- `authorization` (optional for learner, required for non-learner roles) - `Bearer <access token>`

**Request Body** (`UserCreateDto`):
```typescript
{
  userId?: string;
  username: string; // Required (IsNotEmpty)
  password: string; // Required (IsNotEmpty); set as a non-temporary Keycloak credential
  firstName: string; // Required, 1-50 chars
  middleName?: string; // Optional, 0-50 chars
  lastName: string; // Required, 1-50 chars
  gender: "male" | "female" | "transgender"; // Required
  dob?: string; // Optional, ISO date string, not in future
  email?: string; // Optional, validated in service (invalid -> 400)
  mobile?: string; // Optional, validated in service: 10 digits
  address?: string; // Optional
  pincode?: string; // Optional
  district?: string; // Optional
  state?: string; // Optional
  tenantCohortRoleMapping: tenantRoleMappingDto[]; // { tenantId?, cohortIds?: UUID[], roleId? }
  customFields?: FieldValuesOptionDto[]; // Optional, { fieldId, value }
  automaticMember?: AutomaticMemberDto; // Optional, { value, fieldId, fieldName }
}
```

**Response**:
- **Success (201)**: User created successfully
  ```json
  {
    "id": "api.user.create",
    "ver": "1.0",
    "params": {
      "status": "successful",
      "successmessage": "User created successfully"
    },
    "responseCode": 201,
    "result": {
      "userId": "uuid",
      // User data
    }
  }
  ```
- **Error (400)**: Validation errors (DTO, custom fields, tenant/role/cohort/academic-year checks, or a Keycloak 400 such as a name rejected for special characters)
- **Error (401)**: Non-learner role requested and the access token is missing, invalid or expired
- **Error (409)**: Keycloak reports a conflict (username or email already exists); response message is the Keycloak message
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body using `ValidationPipe`
2. Extract `academicYearId` from headers (optional)
3. Call `userService.createUser(userCreateDto, academicYearId, response)`. If an `authorization` header is present, `createdBy` / `updatedBy` are taken from its `sub` claim
4. If `customFields` are present, validate them (`validateCustomField`); failure → 400
5. `validateRequestBody()` checks email, mobile and dob formats; for each `tenantCohortRoleMapping` entry it checks: academic year is supplied when `cohortIds` exist and is active for the tenant, tenant exists, no duplicate tenant, every cohort exists in that academic year, role exists and belongs to that tenant. Any failure → 400 with the errors joined by `"; "`
6. **Access token rule**: if any resolved role has `code` other than `learner`, the request needs `Authorization: Bearer <token>`. The token is verified against `KEYCLOAK_REALM_RSA_PUBLIC_KEY`; missing → 401 "An access token is required to register a user with this role.", invalid or expired → 401 "The provided access token is invalid or has expired.". On success `createdBy` / `updatedBy` default to the caller's `sub`
7. `automaticMember.value = true` together with `cohortIds` in the first mapping → 400 (a user cannot be an automatic member and in a center at the same time)
8. Get a Keycloak admin token and create the user in Keycloak (`createUserInKeyCloak`, role title stored in the `user_roles` attribute). The Keycloak response status is mapped: `201` continues, `409` → 409 `EMAIL_EXIST`, any other 4xx/5xx is passed through as that status (`BAD_REQUEST` message for 400, `SERVER_ERROR` otherwise), anything non-numeric → 500. This is why a name with special characters now returns 400 instead of 500
9. `userId` is set to the Keycloak user id; the `Users` row is saved. Then, if `tenantCohortRoleMapping` is provided: with `automaticMember.value = true`, tenant/role mappings are created and an `AutomaticMember` rule is stored; otherwise `CohortMembers` (resolving `CohortAcademicYear` for the header academic year), `UserRoleMapping` and `UserTenantMapping` rows are created through `assignUserToTenantAndRoll`
10. Custom fields are written with `updateUserCustomFields` and `ufields:{id}` plus `userfilter` caches are invalidated
11. Audit event `USER_CREATED` is emitted, Kafka `USER_CREATED` is published asynchronously, and the response is returned (201)
12. Per-step timings (`[TIMING] ...`) are written to the log

**Edge Cases**:
- Username/email already exists → 409 (surfaced from Keycloak; there is no separate database existence check before creation)
- Non-learner role without a valid token → 401
- Invalid UUID format in mappings → 400 Bad Request
- `cohortIds` without `academicyearid` header → 400 "Academic Year ID is required when a Cohort ID is provided."
- Keycloak service unavailable → 500 Internal Server Error
- A mapping entry without `roleId` → 400 `Role Id 'undefined' does not exist.` (role is effectively required per entry)
- `tenantCohortRoleMapping` omitted entirely → `validateRequestBody` returns `false`, no role is resolved (so the non-learner token rule is not evaluated) and the user is created in Keycloak and the database without any tenant, role or cohort mapping

**Dependencies**:
- `UserService.createUser()`
- `AutomaticMemberService` (if automatic member enabled)
- `KafkaService` (if enabled)
- `CacheService`, `AuditLoggerService`
- Keycloak API

**Side Effects**:
- Creates user in Keycloak
- Creates database records (User, UserTenantMapping, CohortMembers, UserRoleMapping, FieldValues, AutomaticMember)
- Invalidates `ufields:{id}`, `userfilter`, `user:{id}`, `usertenant:{id}`, `userroles:{id}`, `userlist:{tenantId}`
- Emits audit event `USER_CREATED`
- Publishes Kafka event `USER_CREATED`

---

### Update User - PATCH `/update/:userid`

**API ID**: `api.user.update`

**Route**: `PATCH /user/v1/update/:userid`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (optional) - Tenant ID
- `Authorization` (required) - JWT token

**Path Parameters**:
- `userid` (required, UUID) - User ID to update

**Request Body** (`UserUpdateDTO`):
```typescript
{
  userData: {
    username?: string;
    firstName?: string; // 1-50 chars
    lastName?: string; // 1-50 chars
    middleName?: string; // 0-50 chars
    email?: string | null;
    mobile?: string;
    address?: string | null;
    pincode?: string | null;
    district?: string | null;
    state?: string | null;
    dob?: Date | null; // ISO date string, parsed to Date
    gender?: "male" | "female" | "transgender";
    status?: "active" | "inactive" | "archived";
    reason?: string;
    tenantId?: string; // Overwritten from tenantid header
    deviceId?: string; // Requires action
    action?: "add" | "remove"; // Requires deviceId
    updatedBy?: string; // Overwritten with the caller's userId
    createdBy?: string; // Overwritten with the caller's userId
  };
  userId?: string; // Auto-set from path
  customFields?: { fieldId: string; value: string | string[] }[];
  automaticMember?: AutomaticMemberDto; // { value, fieldId, fieldName }
}
```

**Response**:
- **Success (200)**: User updated successfully. `result` is `{ basicDetails, customFields?, editIssues }` where `editIssues` may contain `uneditableFields` (field ids not editable for the tenant) and `editFieldsFailure` (per-field validation failures)
- **Error (400)**: Bad Request, including user not found and Keycloak update failure
- **Error (409)**: New username/email already exists in Keycloak
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `loginUserId` from JWT token using `@GetUserId` decorator
2. Extract `userid` from path parameter
3. Extract `tenantId` from headers (optional)
4. Set `userUpdateDto.userData.updatedBy = loginUserId`
5. Set `userUpdateDto.userData.createdBy = loginUserId`
6. Set `userUpdateDto.userId = userid`
7. Set `userUpdateDto.userData.tenantId = tenantId` (if provided)
8. Call `userService.updateUser()` with:
   - `UserUpdateDTO`
   - Response object
9. Service performs:
   - Validate user exists (not found → 400 with `USER_NOT_FOUND`)
   - Device handling: with `deviceId` + `action = add`, the id is appended to `Users.deviceId` (max 3 devices, oldest dropped); `remove` deletes it
   - If any of `username`, `firstName`, `lastName`, `email` is present, update Keycloak (`updateUsernameInKeycloak`: existence check first, then update). Exists → 409 `USERNAME_EXISTS_KEYCLOAK`; update failure → 400 `UPDATE_USER_KEYCLOAK_ERROR`; exception → 500
   - Save `userData` onto the `Users` row
   - If `status` is present, sync Keycloak enabled flag (`active` = enabled) asynchronously (non-blocking, failures only logged)
   - Update custom fields (only fields editable for the tenant, via `getEditableFieldsAttributes(tenantId)`), then invalidate `ufields:{id}`
   - Invalidate `user:{id}`, `userfilter` and `userlist:{t}` for every tenant the user is mapped to
   - If `automaticMember.value = true`: reject with 400 when an active rule for the same value already exists; reactivate an old inactive rule (deactivating the current one) and return 200 early; otherwise create a new mapping
   - Emit audit event `UPDATED` and publish Kafka `USER_UPDATED` after the response
10. Return formatted response

**Edge Cases**:
- User not found → 400 Bad Request (not 404)
- Invalid `userid` format → not validated by a pipe on this route (`@Param("userid")` has no `ParseUUIDPipe`); an unknown id is reported as user not found
- New username or email already exists in Keycloak → 409 Conflict
- Keycloak update fails → 400 Bad Request; Keycloak exception → 500
- Automatic member already assigned to the same value → 400
- The early 200 return for reactivating an old automatic membership skips the audit event and the Kafka event

**Dependencies**:
- `UserService.updateUser()`
- `FieldsService`, `AutomaticMemberService`
- `KafkaService` (if enabled), `CacheService`, `AuditLoggerService`
- Keycloak API

**Side Effects**:
- Updates user in database
- Updates user in Keycloak (if applicable)
- Updates automatic-member mapping (if provided)
- Invalidates user caches (`user`, `ufields`, `userfilter`, `userlist`)
- Emits audit event `UPDATED` (metadata: `tenantId`, `updatedFields`)
- Publishes Kafka event `USER_UPDATED`

---

### Search Users - POST `/list`

**API ID**: `api.user.list`

**Route**: `POST /user/v1/list`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required) - Tenant ID for filtering
- `Authorization` (required) - JWT token

**Request Body** (`UserSearchDto`):
```typescript
{
  limit?: number;
  offset?: number;
  filters?: {
    search?: string;              // partial match across name OR username (ILIKE %term%)
    name?: string;                // ILIKE %term%
    firstName?: string;           // ILIKE %term%
    username?: string[];          // exact IN list (a non-array value is matched with ILIKE)
    userId?: string[];            // UUID array
    email?: string[];             // valid emails
    status?: ("active" | "inactive")[];                    // Users.status
    tenantStatus?: ("active" | "inactive" | "archived")[]; // UserTenantMapping.status
    role?: string | string[];     // role names, case-insensitive
    tenantId?: string;
    fromDate?: string;            // YYYY-MM-DD, on Users.createdAt
    toDate?: string;              // YYYY-MM-DD, on Users.createdAt
    state?: string; district?: string[]; block?: string[]; village?: string[];
    // any other key is treated as a custom field name and resolved through FieldsService
  };
  exclude?: { userIds?: string[]; cohortIds?: string[] };
  sort?: [string, "asc" | "desc"];   // exactly two elements, e.g. ["username", "asc"]
  customFieldsName?: string[];
  tenantCohortRoleMapping?: { tenantId?: string; cohortId?: string[]; roleId?: string };
  includeCustomFields?: string;      // "true" (default) or "false"
}
```

Search behaviour (`filters.search`, added with the trigram indexes): the value is `trim()`med; empty or whitespace-only strings are ignored; a single-element array is accepted (first element is used). The DTO validates it as an optional string (`@IsString()`). `%` and `_` typed by the caller are not escaped, so they act as ILIKE wildcards.

Example: `{"filters":{"search":" ram "},"limit":10,"offset":0,"sort":["username","asc"]}` runs `(U.name ILIKE '%ram%' OR U.username ILIKE '%ram%')`, returns at most 10 rows, bypasses the cache and uses `idx_users_name_trgm` / `idx_users_username_trgm`.

**Response**:
- **Success (200)**: User list. `totalCount` is `COUNT(*) OVER()` of the filtered rows
  ```json
  {
    "id": "api.user.list",
    "params": { "status": "successful" },
    "responseCode": 200,
    "result": {
      "totalCount": 100,
      "getUserDetails": [
        {
          "userId": "uuid", "enrollmentId": "...", "username": "...", "email": "...",
          "firstName": "...", "name": "...", "middleName": "...", "lastName": "...",
          "gender": "...", "dob": "...", "mobile": 9999999999,
          "tenantId": "uuid", "role": "Learner",
          "status": "active", "tenantStatus": "active",
          "createdBy": "...", "updatedBy": "...", "createdAt": "...", "updatedAt": "...",
          "customFields": [ { "fieldId": "...", "label": "...", "selectedValues": [], "type": "..." } ]
        }
      ]
    }
  }
  ```
- **Error (404)**: No users matched (also returned when a custom-field filter resolves to no source)
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `tenantId` from headers (the controller does not reject a missing header; without it the tenant filter and the cache are skipped)
2. `includeCustomFields !== "false"` decides whether custom fields are attached
3. Call `userService.searchUser(tenantId, response, userSearchDto, shouldIncludeCustomFields)`
4. `findAllUserDetails()` serves from `userlist:{tenantId}` unless the cache is bypassed (see Caching), otherwise `findAllUserDetailsUncached()`:
   - Builds a query over `Users` joined with `CohortMembers`, `UserRolesMapping`, `UserTenantMapping` (same tenant as the role mapping) and `Roles`
   - Core filters are applied only for keys that are `Users` columns or one of `fromDate`, `toDate`, `role`, `tenantId`, `name`, `tenantStatus`, `search`; other keys go to the custom-field filter
   - Applies `exclude`, the header tenant filter (`UTM.tenantId`), sorting (`U.<column> ASC|DESC`) and `offset`/`limit`
   - Attaches custom fields in bulk (`getBulkCustomFieldDetails`) when requested, otherwise `customFields: []`
5. Return formatted response

**Edge Cases**:
- No users found → 404 Not Found (not an empty array)
- Invalid filter values (`email`, `userId`, `status`, `tenantStatus`, dates, sort shape or direction) → 400 Bad Request from `ValidationPipe`
- A user with several roles in the tenant appears once per role (rows are grouped by user, tenant, tenant status and role name)

**Dependencies**:
- `UserService.searchUser()`
- `FieldsService` (custom-field filters and values)
- `CacheService`

**Side Effects**: None (a cache entry may be written)

---

### Delete User - DELETE `/delete/:userId`

**API ID**: `api.user.delete`

**Route**: `DELETE /user/v1/delete/:userId`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `Authorization` (required) - JWT token

**Path Parameters**:
- `userId` (required, UUID) - User ID to delete

**Response**:
- **Success (200)**: User deleted successfully (`result` is the TypeORM delete result)
- **Error (400)**: `userId` is not a valid UUID
- **Error (404)**: User Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from path parameter (no `ParseUUIDPipe`; the service validates the UUID)
2. Call `userService.deleteUserById(userId, response)`
3. Service performs a **hard delete**:
   - Check the user exists
   - Read the tenant ids the user is mapped to (needed for cache invalidation)
   - Delete, in this order: `CohortMembers`, `UserTenantMapping`, `UserRoleMapping`, `FieldValues` (where `itemId = userId`), then the `Users` row
   - Invalidate `user`, `ufields`, `usertenant`, `userroles`, `userfilter` and each `userlist:{t}`
   - Delete the user from Keycloak with `DELETE {KEYCLOAK_ADMIN}/{encodeURIComponent(userId)}`. The URL is built with `new URL(...)` and the id is URL-encoded (code-scanning SSRF fix)
   - Send the response, then publish Kafka `USER_DELETED` and emit audit event `DELETED`
4. Return formatted response

**Edge Cases**:
- User not found → 404 Not Found
- Already deleted → 404 Not Found
- Keycloak deletion fails → 500, but the database rows are already removed (no rollback)

**Dependencies**:
- `UserService.deleteUserById()`
- `KafkaService` (if enabled)
- Keycloak API

**Side Effects**:
- Permanently deletes the user and related rows from the database
- Deletes the user from Keycloak
- Invalidates user caches
- Emits audit event `DELETED`
- Publishes Kafka event `USER_DELETED`

---

### Send Password Reset Link - POST `/password-reset-link`

**API ID**: `api.user.sendLinkForResetPassword`

**Route**: `POST /user/v1/password-reset-link`

**Authentication**: Not required

**Request Body** (`SendPasswordResetLinkDto`):
```typescript
{
  username: string; // Required, non-empty string
  redirectUrl: string; // Required, non-empty string
}
```

**Response**:
- **Success (200)**: Password reset link sent successfully; `result` is `{ email }` (the address the link was sent to)
- **Error (404)**: Username not found
- **Error (400)**: No email on the user or on the creating user, or the notification service reported email errors
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.sendPasswordResetLink()` with:
   - Request object
   - `username`
   - `redirectUrl`
   - Response object
3. Service performs:
   - Find user by username
   - Get user email; if the user has none, fall back to the email of `createdBy`
   - Generate a JWT (`sub` = userId, signed with `RBAC_JWT_SECRET`, expiry `PASSWORD_RESET_JWT_EXPIRES_IN`)
   - Send the `OnForgotPasswordReset` email (context `USER`) with `resetToken`, program name (first tenant name, default "Learner Account"), expiry text, `{frontEndUrl}` = `RESET_FRONTEND_URL/reset-password` and `{redirectUrl}`
4. Return formatted response

**Edge Cases**:
- Username not found → 404 Not Found
- User has no email → 400 Bad Request
- Notification service unavailable → 500 Internal Server Error

**Dependencies**:
- `UserService.sendPasswordResetLink()`
- `NotificationRequest`
- `JwtUtil`

**Side Effects**:
- Sends email notification with reset link

---

### Reset Password - POST `/reset-password`

**API ID**: `api.user.resetPassword`

**Route**: `POST /user/v1/reset-password`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`ResetUserPasswordDto`):
```typescript
{
  userName: string; // No validator; not used to select the target user
  newPassword: string; // Required, non-empty string
}
```

**Response**:
- **Success (200)**: Password reset successfully
- **Error (400)**: Keycloak rejected the new password
- **Error (404)**: Authenticated user not found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.resetUserPassword()` with:
   - Request object
   - `userName`
   - `newPassword`
   - Response object
3. Service performs:
   - Resolve the target as the **authenticated caller** (`request.user.username`); the `userName` body value is ignored, so this endpoint changes the caller's own password only
   - Get Keycloak admin token
   - Reset password in Keycloak (`resetKeycloakPassword`); status 204 means success
   - On success, enable the `password_auth_enabled` Keycloak attribute if it was disabled (for SSO users; failure here is logged and ignored)
   - Set `temporaryPassword = false` if it was true
4. Return formatted response

**Dependencies**:
- `UserService.resetUserPassword()`
- Keycloak API

**Side Effects**:
- Updates password in Keycloak
- Updates `temporaryPassword` flag in database

---

### Forgot Password - POST `/forgot-password`

**API ID**: `api.user.forgotPassword`

**Route**: `POST /user/v1/forgot-password`

**Authentication**: Not required

**Request Body** (`ForgotPasswordDto`):
```typescript
{
  token: string; // Required - JWT token from reset link
  newPassword: string; // Required
}
```

**Response**:
- **Success (200)**: Password reset successfully
- **Error (404)**: User not found
- **Error (401)**: Invalid or expired token
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.forgotPassword()` with:
   - Request object
   - Body
   - Response object
3. Service performs:
   - Validate JWT token
   - Extract user ID from token
   - Get Keycloak admin token
   - Reset password in Keycloak
   - Update `temporaryPassword` flag
4. Return formatted response

**Edge Cases**:
- Invalid token → 401 Unauthorized (`INVALID_TOKEN`)
- Expired token → 401 Unauthorized (`LINK_EXPIRED`)
- User not found → 404 Not Found
- Keycloak update fails → 500 Internal Server Error

**Dependencies**:
- `UserService.forgotPassword()`
- `JwtUtil`
- Keycloak API

**Side Effects**:
- Updates password in Keycloak
- Updates `temporaryPassword` flag

---

### Send OTP - POST `/send-otp`

**API ID**: `api.send.OTP`

**Route**: `POST /user/v1/send-otp`

**Authentication**: Not required

**Request Body** (`OtpSendDTO`):
```typescript
{
  mobile: string; // Required, exactly 10 digits
  reason: "signup" | "login" | "forgot"; // Required
}
```

**Response**:
- **Success (200)**: OTP sent successfully. `result.data` is `{ message: "OTP sent to <mobile>", hash: "<hash>.<expiresEpochMs>", sendStatus }`. The client must keep `hash` and send it back to `/verify-otp`
- **Error (400)**: Bad Request (invalid mobile or reason)
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.sendOtp()` with:
   - Body
   - Response object
3. Service performs:
   - Generate OTP (`OTP_DIGITS` digits, default 6)
   - Build a stateless hash: HMAC of `+91<mobile>.<otp>.<reason>.<expiresEpochMs>` keyed with `SMS_KEY` (expiry `OTP_EXPIRY` minutes, default 10). **Nothing is stored server-side**; the OTP is validated later by recomputing the hash
   - Send the OTP by SMS through the notification service (`OTP` / `SEND_OTP`)
   - When `STATIC_OTP_ENABLED=true` the OTP is `STATIC_OTP` (default `1234`) and no SMS is sent (`sendStatus` is `skipped (static OTP mode)`); intended for QA load testing only
4. Return formatted response

**Dependencies**:
- `UserService.sendOtp()`
- `NotificationRequest`
- `AuthUtils.calculateHash()`

**Side Effects**:
- Sends SMS with OTP (not in static OTP mode)

---

### Verify OTP - POST `/verify-otp`

**API ID**: `api.verify.OTP`

**Route**: `POST /user/v1/verify-otp`

**Authentication**: Not required

**Request Body** (`OtpVerifyDTO`):
```typescript
{
  mobile?: string; // Required when reason = "signup", exactly 10 digits
  otp: string; // Required, exactly OTP_DIGITS digits
  hash: string; // Required, 10-256 chars: the "<hash>.<expires>" value returned by send-otp
  reason: "signup" | "forgot"; // Required
  username?: string; // Required when reason = "forgot"
}
```

**Response**:
- **Success (200)**: OTP verified successfully. `result` is `{ success: true }`; for `reason = "forgot"` it also contains `token`, a password-reset JWT usable with `POST /forgot-password`
- **Error (400)**: Invalid hash format, expired or invalid OTP, missing mobile/username, invalid reason
- **Error (404)**: `forgot` flow and username not found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validate request body
2. Call `userService.verifyOtp()` with:
   - Body
   - Response object
3. Service performs:
   - Split `hash` into `<hash>.<expires>`; reject a malformed value
   - Reject if `Date.now()` is past `expires`
   - Recompute the HMAC over `<identifier>.<otp>.<reason>.<expires>` with `SMS_KEY` and compare with the supplied hash
   - For `forgot`, also look up the user by `username` and mint the reset token
4. Return formatted response

**Edge Cases**:
- Malformed hash → 400 (`INVALID_HASH_FORMAT`)
- OTP expired → 400 (`OTP_EXPIRED`)
- OTP mismatch → 400 (`OTP_INVALID`)

**Dependencies**:
- `UserService.verifyOtp()`

**Side Effects**: None

---

### Send Password Reset OTP - POST `/password-reset-otp`

**API ID**: `api.send.reset.otp`

**Route**: `POST /user/v1/password-reset-otp`

**Authentication**: Not required

**Request Body** (`SendPasswordResetOTPDto`):
```typescript
{
  username: string; // Required
}
```

**Response**:
- **Success (200)**: Password reset OTP sent. `result` is `{ hash: "<hash>.<expires>", success: [...], Error: [...] }` listing which channels (SMS, Email) succeeded or failed
- **Error (400)**: Username not found, or the user has neither mobile nor email
- **Error (500)**: Both SMS and email delivery failed

**Business Logic**:
1. Validate request body
2. Call `userService.sendPasswordResetOTP()` with:
   - Body
   - Response object
3. Service performs:
   - Find user by username
   - Generate OTP and a stateless hash over `<username>.<otp>.forgot.<expires>`
   - Send the OTP by SMS (if the user has a mobile) and by email (if the user has an email) using the `Reset_OTP` template
   - Static OTP mode skips both sends
4. Return formatted response

**Dependencies**:
- `UserService.sendPasswordResetOTP()`
- `NotificationRequest`

**Side Effects**:
- Sends SMS and/or email with OTP

---

### Get Presigned URL - GET `/presigned-url`

**API ID**: `api.get.signedURL`

**Route**: `GET /user/v1/presigned-url`

**Authentication**: Not required

**Query Parameters**:
- `filename` (required) - File name
- `foldername` (optional) - Folder prefix
- `fileType` (required) - File extension including the dot (for example `.png`); used both to derive the `Content-Type` and appended to the object key

**Response**:
- **Success (200)**: Standard envelope (`api.get.signedURL`) with a presigned **POST** (`result` is `{ url, fields }`), not a bare `{ url }`. The service writes the response itself.
  ```json
  {
    "id": "api.get.signedURL",
    "responseCode": 200,
    "result": {
      "url": "https://<bucket>.s3.<region>.amazonaws.com/",
      "fields": { "key": "folder/name-<uuid>.png", "Content-Type": "image/png", "...": "..." }
    }
  }
  ```
- **Error (500)**: Presigned POST generation failed

**Business Logic**:
1. Extract query parameters
2. Call `uploadS3Service.getPresignedUrl()` with:
   - `filename`
   - `fileType`
   - Response object
   - `foldername`
3. Service builds the key `<foldername>/<filename>-<uuid><fileType>` and calls `createPresignedPost` (AWS SDK v3). Conditions: `key` must equal the generated key, any `Content-Type` accepted, no content-length limit. Validity is 24 hours
4. Return `{ url, fields }`; the client uploads with a multipart form POST containing `fields` followed by the file

**Dependencies**:
- `UploadS3Service.getPresignedUrl()`
- AWS S3

**Side Effects**: None

---

### User Hierarchy View - POST `/users-hierarchy-view`

**API ID**: `api.user.hierarchyView`

**Route**: `POST /user/v1/users-hierarchy-view`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required, UUID) - Tenant ID; validated by `@GetTenantId()` (missing or non-UUID → 400)

**Request Body** (`UserHierarchyViewDto`):
```typescript
{
  email: string; // Required, valid email
}
```

**Response**:
- **Success (200)**: `result` is `{ user }`: user core fields, `customFields`, and `tenantData: [{ tenantId, tenantName, tenantStatus, roleData: [{ roleId, roleName }] }]` (tenants without roles are omitted; `tenantId`, `role`, `tenantStatus`, `total_count` are removed from the user object)
- **Error (400)**: Tenant has no parent tenant, or email has no domain
- **Error (403)**: Email domain does not match the parent tenant's `domain`
- **Error (404)**: Tenant, parent tenant or user not found

**Business Logic**:
1. Extract `tenantId` using `@GetTenantId()` decorator
2. Validate request body
3. Call `userService.searchUserMultiTenant()` with:
   - `tenantId`
   - Request object
   - Response object
   - `UserHierarchyViewDto`
4. Service performs:
   - Load the header tenant, then its parent tenant (`parentId`)
   - Compare the email's domain (case-insensitive) with the parent tenant's `domain`
   - Look the user up by email across all tenants with `findAllUserDetails` (no tenant, so the list cache is bypassed; custom fields off), take the first row
   - Load custom fields and per-tenant role data (`userTenantRoleData`)
5. Return formatted response

**Dependencies**:
- `UserService.searchUserMultiTenant()`

**Side Effects**: None

---

### Hierarchical Search - POST `/hierarchical-search`

**API ID**: `api.user.list`

**Route**: `POST /user/v1/hierarchical-search`

**Authentication**: Required (`JwtAuthGuard`)

**Headers**:
- `tenantid` (required, UUID) - Tenant ID; missing, empty or non-UUID → 400 with the standard error envelope
- `academicyearid` (optional, UUID) - Restricts users to those with a cohort membership in that academic year and scopes the returned `cohortData` to it

**Request Body** (`HierarchicalLocationFiltersDto`; `whitelist` + `forbidNonWhitelisted` are on, so unknown properties → 400):
```typescript
{
  limit: number;   // Required, 1-100
  offset: number;  // Required, >= 0
  filters: {       // Required object, every key optional
    state?: string[];    // max 100
    district?: string[]; // max 500
    block?: string[];    // max 2000
    village?: string[];  // max 5000
    center?: string[];   // max 1000
    batch?: string[];    // UUIDs, max 1000
    status?: ("active" | "inactive" | "archived")[]; // max 3; applied to UserTenantMapping.status
    name?: string;       // non-empty, ILIKE %name% on Users.name
  };
  sort: [field, direction]; // Required. field: name|firstName|lastName|username|email|createdAt, direction: asc|desc
  role?: string[];          // role names, max 50
  customfields?: string[];  // location custom field names to return (batch/center are dropped)
}
```

**Response**:
- **Success (200)**: `result` is `{ users, totalCount, currentPageCount, limit, offset, sort: { field, direction } }`. When nothing matches, `users` is `[]` and the message explains which filters were applied
  ```json
  {
    "userId": "uuid", "username": "...", "firstName": "...", "name": "...", "middleName": "...", "lastName": "...",
    "email": "...", "mobile": 9999999999, "gender": "...", "dob": "...",
    "status": "active",
    "createdAt": "...", "tenantJoinedAt": "...", "enrollmentId": "...", "tenantId": "uuid",
    "roles": ["Learner"],
    "customfield": [],
    "cohortData": [ { "centerId": "...", "centerName": "...", "centerStatus": "...", "batchId": "...", "batchName": "...", "batchStatus": "...", "cohortMember": { "status": "...", "membershipId": "..." } } ]
  }
  ```
  `status` is the user-tenant mapping status. `tenantJoinedAt` (the `UserTenantMapping.createdAt`) and `enrollmentId` were added to each user; academic-year scoping was added to the query and to `cohortData`.
- **Error (400)**: Invalid tenant header or body
- **Error (500)**: Query failure

**Business Logic**:
1. Extract `tenantid` and optional `academicyearid` from headers; validate the tenant id
2. Call `userService.getUsersByHierarchicalLocation(tenantId, request, response, dto, academicYearId)`
3. Only the **deepest** location filter provided is used, in the order `batch` > `center` > `village` > `block` > `district` > `state`
   - `batch`: join `CohortMembers` where `cohortId` is in the list
   - `center`: members of the center itself or of batches whose `parentId` is the center
   - `state`/`district`/`block`/`village`: join `FieldValues`/`Fields` on the field named like the level, array-overlap with the ids, `FieldValues.tenantId` in (tenant, parent tenant)
4. Always filters `UserTenantMapping.tenantId`; adds the academic-year join (`CohortMembers` → `CohortAcademicYear`) when the header is present, role filter (tenant-scoped), name and status filters
5. Paginates in SQL (`filtered_users` CTE, `COUNT` total), groups role rows per user, then loads requested custom fields and batch/center data for the page
6. Results are never cached

**Edge Cases**:
- Missing / empty / non-UUID `tenantid` → 400
- Sort field outside the allowed list or direction other than asc/desc → 400
- No `academicyearid` header → `cohortData` is empty for every user
- Empty `filters` is allowed and returns the tenant's users

Example: `{"limit":10,"offset":0,"filters":{"district":["d1"],"village":["v1"],"name":"ra"},"sort":["name","asc"],"role":["Learner"]}` filters by `village` only (deepest), name containing "ra", role Learner, sorted by name.

**Dependencies**:
- `UserService.getUsersByHierarchicalLocation()`

**Side Effects**: None

---

### Check User - POST `/check`

**API ID**: `api.user.create`

**Route**: `POST /user/v1/check`

**Authentication**: Not required

**Request Body** (`ExistUserDto`):
```typescript
{
  firstName?: string;  // 1-50, matched with ILIKE %value%
  middleName?: string; // 0-50, ILIKE %value%
  lastName?: string;   // 0-50, ILIKE %value%
  email?: string;      // valid email
  mobile?: string;     // exactly 10 digits
}
```

**Response**:
- **Success (200)**: Array of matching users with only `username`, `firstName`, `name`, `middleName`, `lastName`, `mobile`
- **Error (404)**: No match

**Business Logic**:
1. Validate request body
2. Call `userService.checkUser()` with:
   - Request object
   - Response object
   - `ExistUserDto`
3. Each provided value is sanitised (`%`, `_`, `\` escaped) and added to the `where` clause (AND); the controller uses API ID `api.user.create` for this route
4. Return matches

**Dependencies**:
- `UserService.checkUser()`

**Side Effects**: None

---

### Suggest Username - POST `/suggestUsername`

**API ID**: `api.suggest.username`

**Route**: `POST /user/v1/suggestUsername`

**Authentication**: Not required

**Request Body** (`SuggestUserDto`):
```typescript
{
  firstName: string; // Required, 1-50 chars
  lastName: string;  // Required, 1-50 chars
}
```

**Response**:
- **Success (200)**: `result` is `{ suggestedUsername: "<base><digits>" }` (a single suggestion)
- **Error (400)**: Validation failure, or names contain no `a-z`/`0-9` after normalisation
- **Error (500)**: No free username found in the 2-7 digit ranges

**Business Logic**:
1. Validate request body
2. Call `userService.suggestUsername()` with:
   - Request object
   - Response object
   - `SuggestUserDto`
3. Service builds `base` = `firstName + lastName`, NFD-normalised, lower-cased, stripped to `[a-z0-9]`
4. One indexed query (`LOWER(username) LIKE 'base%'` plus regex `^base[0-9]{2,7}$`, served by `idx_users_username_lower_prefix`) returns all taken `base+digits` usernames
5. Uses the shortest digit length (2 up to 7) that still has a free number and picks a random free number in that range
6. The suggestion is not a reservation; the unique constraint on `Users.username` (and Keycloak) decides at create time. Only the database is checked, not Keycloak

Example: `{"firstName":"Ravi","lastName":"Kumar"}` with `ravikumar10`..`ravikumar99` all taken returns something like `ravikumar482`.

**Dependencies**:
- `UserService.suggestUsername()`

**Side Effects**: None

---

## Common Issues & Solutions

### Issue: User creation fails with "User already exists"
**Solution**: Check if username exists in both Keycloak and database before creation. Use `checkUser` endpoint first.

### Issue: Custom fields not appearing in user details
**Solution**: Ensure `fieldvalue=true` query parameter is passed in GET request, and custom fields are created with correct `itemId` (userId) and `contextType` ("USERS").

### Issue: Tenant isolation not working
**Solution**: Always include `tenantid` header in requests and ensure all queries filter by `tenantId`. Check `UserTenantMapping` table for correct tenant assignments.

### Issue: Password reset link not working
**Solution**: Check JWT secret configuration, token expiry settings, and notification service availability. Verify user email exists.

### Issue: OTP not received
**Solution**: Check SMS service configuration, mobile number format, and notification service availability. Verify `SMS_KEY` and `MSG91_TEMPLATE_KEY` are configured.

### Issue: Non-learner registration returns 401
**Solution**: `POST /create` needs `Authorization: Bearer <access token>` when any requested role is not `learner`; the token must verify against `KEYCLOAK_REALM_RSA_PUBLIC_KEY`.

### Issue: Search results look stale
**Solution**: `POST /list` is cached for 3 minutes per tenant and invalidated by user writes. Requests with `filters.search` or `filters.firstName` always bypass the cache. Check `CACHE_ENABLED` and `CACHE_DISABLED_NAMESPACES`.

### Issue: Kafka events not publishing
**Solution**: Check `kafkaEnabled` configuration flag and Kafka broker connectivity. Verify topic creation and producer configuration.

### Performance Considerations
- Use pagination for user list endpoints
- Name/username substring search relies on the trigram GIN indexes; run the migrations (`pg_trgm` extension required)
- `/list` and `GET /read` are cached (see Caching); hierarchical search is not
- Optimize queries with custom fields (only fetch when needed)

### Common Mistakes to Avoid
1. **Not validating tenantId**: Always validate tenantId format and presence
2. **Missing error handling**: Always handle Keycloak and external service failures
3. **Not checking user existence**: Verify user exists before update/delete operations
4. **Hardcoding values**: Use constants from `API_RESPONSES` and `APIID` config
5. **Skipping validation**: Always use DTOs with class-validator decorators
6. **Not logging errors**: Use `LoggerUtil` for error logging with context
7. **Breaking tenant isolation**: Never query users without tenantId filter
