# Cohort Members Module

## Module Overview

The Cohort Members module manages the relationship between users and cohorts. It handles assignment of users to cohorts, bulk assignments, updates, and retrieval of cohort membership information.

**Purpose**: Manage user-cohort relationships with support for academic year context, custom fields, member roles, status tracking and bulk operations.

**Key Entities**:
- `CohortMembers` - Maps users to cohorts (through `CohortAcademicYear`)

**Dependencies**:
- `UserModule` - For user validation and `USER_UPDATED` events after bulk operations
- `CohortModule` / `Cohort` repository - For cohort lookups
- `AcademicyearsModule` - For academic year context (`getActiveAcademicYear`)
- `FieldsModule` - For custom fields
- `KafkaService` - `COHORT_MEMBER_*` events
- `CacheService` - Response caching (see `docs/CACHING_STRATEGY.md`, section 2.1.4)
- `AuditLoggerService` (`@tekdi/audit-logger/nestjs`) - Audit trail

All routes are protected by `JwtAuthGuard` and served under `user/v1/cohortmember`. The caller's `userId` is read from the JWT `sub` claim.

## Database Schema

### CohortMembers Entity (`CohortMembers`)
- `cohortMembershipId` (UUID, Primary Key, Auto-generated)
- `cohortId` (UUID) - Cohort
- `cohortAcademicYearId` (UUID) - Link to `CohortAcademicYear` (this is how the academic year is stored; there is no `tenantId` column)
- `userId` (UUID) - Member
- `cohortMemberRole` (String, Nullable) - Role inside the cohort, stored upper-case (e.g. `POC`, `PTM`)
- `status` (Enum `MemberStatus`, default `active`) - `active`, `inactive`, `dropout`, `archived`, `reassigned`, `pending`
- `statusReason` (String) - Reason for the status; mandatory in the update API when `status = dropout`
- `createdBy`, `updatedBy` (UUID, Nullable)
- `createdAt`, `updatedAt` (Date)

## Cross-cutting Behaviour

### Caching
TTL is 180 seconds (`COHORTMEMBER_TTL_SECONDS`), namespace `cohortmember:{tenantId}`, dependent on `fieldsdef` and `userlist:{tenantId}`.

| Endpoint | Key |
|----------|-----|
| `GET /read/:cohortId` | `read:{cohortId}:{academicYearId}:cf{0/1}` |
| `POST /list` | `list:{hash(body, academicYearId)}` |

Error responses (404/400) are written inside the loader and are never cached. Invalidation (`cohortmember:{t}` and `userlist:{t}`): create, update, delete, bulk create (which also bumps `user:{userId}` for each affected user), and `publishCohortMemberEvent` when the row carries a `tenantId`.

### Kafka Events
Topic from `KAFKA_TOPIC` (default `user-topic`), message key = `cohortMembershipId`, payload `{ eventType, timestamp, cohortMembershipId, data }`.
- `COHORT_MEMBER_CREATED` - on single create (data = saved row + `academicYearId`)
- `COHORT_MEMBER_UPDATED` - on single update (and once more when custom fields were updated), and for each member whose status was cascaded by a cohort update (`PUT /cohort/update/:cohortId`)
- `COHORT_MEMBER_DELETED` - supported by the publisher but not currently triggered by `DELETE /delete/:id`
- Bulk create does not publish `COHORT_MEMBER_*`; it publishes `USER_UPDATED` for every affected user

Publishing is fire-and-forget; failures are logged only.

### Audit Logs
`entityType: "COHORT_MEMBER"` through `AuditLoggerService` (actor context from `getAuditContext()`):
- `CREATED` on single create - metadata `cohortId`, `userId`, `role`, `status`
- `UPDATED` on update - metadata `cohortMembershipId`, `updates` (the update payload)

Delete and bulk create do not emit audit logs.

## API Endpoints

### Create Cohort Member - POST `/create`

**API ID**: `api.cohortmember.create`

**Route**: `POST /user/v1/cohortmember/create`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)
- `deviceid` (optional) - Device ID

**Request Body** (`CohortMembersDto`):
- `userId` (required, UUID)
- `cohortId` (required, UUID)
- `cohortAcademicYearId` (optional, overwritten by the service)
- `cohortMemberRole` (optional, upper-cased)
- `status` (optional, `MemberStatus`; defaults to `active`)

**Response**: Saved cohort member (HTTP 200)

**Business Logic**:
1. User must exist
2. Academic year must be active for the tenant
3. The cohort must be mapped to the academic year (resolves `cohortAcademicYearId`)
4. The user must not already be a member of the cohort for that year (any status)
5. Sets `createdBy`/`updatedBy` from the JWT, saves, emits audit log, invalidates cache, publishes `COHORT_MEMBER_CREATED`

**Edge Cases**:
- Missing/invalid `tenantid` or `academicyearid` → 400 Bad Request
- User not found → 400 Bad Request
- Academic year not active for tenant → 404 Not Found
- Cohort not in academic year → 404 Not Found
- Already assigned → 409 Conflict

---

### Get Cohort Members - GET `/read/:cohortId`

**API ID**: `api.cohortmember.get`

**Route**: `GET /user/v1/cohortmember/read/:cohortId`

**Authentication**: Required

**Headers**:
- `tenantid` (required in practice) - the service returns 400 (`Tenanat Id required`) when absent
- `academicyearid` (required, UUID)

**Query Parameters**:
- `fieldvalue` (optional) - Set to "true" to include custom fields

**Path Parameters**:
- `cohortId` (required) - Cohort ID

**Response**: `{ userDetails: [ ... ] }` list of members with optional custom fields

**Edge Cases**:
- `cohortId` not a UUID → 400 Bad Request
- Cohort not mapped to the academic year → 404 Not Found
- No members → 404 Not Found

---

### Search Cohort Members - POST `/list`

**API ID**: `api.cohortmember.list`

**Route**: `POST /user/v1/cohortmember/list`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Request Body** (`CohortMembersSearchDto`):
- `limit`, `offset`
- `filters`:
  - `cohortId` (UUID) - required unless `userId` is given
  - `userId` (UUID) - required unless `cohortId` is given
  - `role` - exact match on the user's role name
  - `name` - partial, case-insensitive match (`ILIKE %value%`) on the user's `name` (search by name)
  - `firstName`, `middleName`, `lastName` - partial, case-insensitive matches
  - `status` - array of member statuses
  - `cohortMemberRole` - array of cohort member roles (e.g. `["POC", "PTM"]`)
- `sort`: `[field, "asc" | "desc"]` (sorted on the `Users` column of that name)

**Response**: `{ totalCount, userDetails: [ { userId, enrollmentId, username, firstName, middleName, lastName, role, mobile, deviceId, status, statusReason, cohortMembershipId, cohortMemberRole, createdAt, updatedAt, createdBy, updatedBy, customField } ] }`

**Business Logic**:
1. When `cohortId` / `userId` is given, it is checked against `CohortAcademicYear` for the academic year; both given must resolve to the same cohort academic year
2. The resulting `cohortAcademicYearId` list is added to the filter, so results are scoped to the academic year
3. Users are joined to `UserTenantMapping` (tenant from header), roles and `CohortMembers`
4. Custom fields are loaded in one bulk call (`getBulkCustomFieldDetails`) and merged with the membership-level custom fields
5. Cached 3 minutes

**Edge Cases**:
- Cohort or user not in the academic year → 404 Not Found
- Cohort and user do not belong to the same academic year mapping → 404 Not Found
- No result → 404 Not Found (`User details not found`)

---

### Update Cohort Member - PUT `/update/:cohortmembershipid`

**API ID**: `api.cohortmember.update`

**Route**: `PUT /user/v1/cohortmember/update/:cohortmembershipid`

**Authentication**: Required

**Path Parameters**:
- `cohortmembershipid` (required, UUID) - Cohort membership ID

**Request Body** (`CohortMembersUpdateDto`):
- `status` (optional, `MemberStatus`)
- `statusReason` (required string when `status = dropout`)
- `cohortId`, `userId` (optional)
- `customFields` (optional, array of `{ fieldId, value }`, context `COHORTMEMBER`)

`updatedBy` is set from the JWT.

**Response**: Empty array with `Cohort Member updated successfully` (HTTP 200, or 201 when custom fields were updated)

**Business Logic**: Loads the membership, merges the DTO onto it and saves, emits the `UPDATED` audit log, publishes `COHORT_MEMBER_UPDATED`, resolves the cohort's tenant to invalidate `cohortmember:{t}` / `userlist:{t}`, then writes custom field values.

**Edge Cases**:
- Invalid UUID → 400 Bad Request
- Membership or its cohort not found → 404 Not Found
- Custom field processing fails → 500

---

### Delete Cohort Member - DELETE `/delete/:id`

**API ID**: `api.cohortmember.delete`

**Route**: `DELETE /user/v1/cohortmember/delete/:id`

**Authentication**: Required

**Headers**:
- `tenantid` (optional) - used only to invalidate the cache namespace

**Path Parameters**:
- `id` (required) - Cohort membership ID

**Response**: Delete result, message `Cohort Member deleted Successfully.`

**Business Logic**: Hard-deletes the row; invalidates `cohortmember:{tenantid}` and `userlist:{tenantid}` when the header is present.

**Edge Cases**:
- Membership not found → 404 Not Found

---

### Bulk Create Cohort Members - POST `/bulkCreate`

**API ID**: `api.cohortmember.create`

**Route**: `POST /user/v1/cohortmember/bulkCreate`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Request Body** (`BulkCohortMember`):
- `userId` (required, array of UUID v4, 1 to 1000)
- `cohortId` (optional, array of UUID v4, max 1000) - cohorts to add the users to
- `removeCohortId` (optional, array of UUID v4, max 1000) - cohorts to remove the users from
- `cohortMemberRole` (optional, upper-cased)
- `status` (optional, `MemberStatus`) - status used for newly inserted rows

The acting user is taken from the JWT (the earlier `userId` query parameter is no longer read).

**Response**: Array of saved/updated memberships and messages (HTTP 201)

**Business Logic**:
1. Academic year must be active for the tenant (404 otherwise)
2. For each user (skipped with an error entry if the user does not exist):
   - For each `removeCohortId` (cohort must be mapped to the year): the existing membership is set to `reassigned`
   - For each `cohortId` (cohort must be mapped to the year): if a membership already exists in any status it is saved back as `active` with the new `updatedBy` (and `cohortMemberRole` if supplied), so a reassigned member can be re-added; otherwise a new row is inserted with the requested `status`
3. Invalidates `user:{userId}` for each affected user plus `cohortmember:{t}` and `userlist:{t}`, then publishes `USER_UPDATED` for each affected user

## Common Issues & Solutions

### Issue: Cohort member not created
**Solution**: Verify `tenantid`, `academicyearid`, `userId`, and `cohortId` are valid UUIDs, the cohort is mapped to the academic year (`CohortAcademicYear`) and the year is active.

### Issue: Bulk create fails partially
**Solution**: Check each member assignment individually. Ensure all required fields are provided and valid. The cohort must exist for the academic year.

### Issue: User re-added through bulk create is not `pending`
**Solution**: An existing membership (any status) is always set back to `active` by bulk create; `status` in the body only applies to brand new rows.

### Issue: Dropout update rejected
**Solution**: Send `statusReason` together with `status: "dropout"`.

### Common Mistakes to Avoid
1. Not validating UUID formats
2. Missing academic year context
3. Not checking user/cohort existence before assignment
4. Omitting `tenantid` on the read endpoint
