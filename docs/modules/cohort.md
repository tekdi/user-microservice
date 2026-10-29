# Cohort Module

## Module Overview

The Cohort module manages cohort entities, which represent granular groupings of users based on common attributes (e.g., classes, batches, groups, centers). Cohorts support hierarchical structures with parent-child relationships and are associated with academic years and tenants.

**Purpose**: Manage cohort creation, updates, status changes, deletion, search, and retrieval with support for hierarchical structures, academic year associations, custom fields, Kafka events, audit logs and response caching.

**Key Entities**:
- `Cohort` - Core cohort entity
- `CohortAcademicYear` - Maps cohorts to academic years
- `CohortMembers` - Read/updated when a cohort status changes

**Dependencies**:
- `AcademicyearsModule` - For academic year validation (`getActiveAcademicYear`)
- `CohortAcademicYearModule` - For cohort-academic year mappings (and the `COHORT_ACADEMIC_YEAR_CREATED` event)
- `FieldsModule` - For custom fields
- `AutomaticMemberModule` - Used by `mycohorts` to resolve rule-based cohorts
- `KafkaService` - `COHORT_*` and `COHORT_MEMBER_*` events
- `CacheService` - Response caching (see `docs/CACHING_STRATEGY.md`, section 2.1.3)
- `AuditLoggerService` (`@tekdi/audit-logger/nestjs`) - Audit trail

All routes are protected by `JwtAuthGuard` (controller level) and are served under the `user/v1` global prefix.

## Database Schema

### Cohort Entity (`Cohort`)
- `cohortId` (UUID, Primary Key, Auto-generated)
- `parentId` (String, Nullable) - Parent cohort ID for hierarchy
- `name` (String, Nullable) - Cohort name (lower-cased on create)
- `type` (String, Nullable) - Cohort type (e.g., `COHORT`/center, `BATCH`)
- `status` (String, Required) - `active`, `inactive`, `archived`, `pending`
- `image` (JSON Array, Nullable) - Array of image file paths
- `referenceId` (String, Nullable) - Reference identifier
- `metadata` (String, Nullable) - Additional metadata (JSON string, e.g. `{"blockId": "881"}`)
- `tenantId` (String, Nullable) - Associated tenant ID
- `programId` (String, Nullable) - Associated program ID
- `attendanceCaptureImage` (Boolean, Required) - Always set to `false` on create
- `createdBy`, `updatedBy` (String, Required) - User IDs
- `createdAt`, `updatedAt` (Timestamp with timezone)

## Cross-cutting Behaviour

### Headers
- `tenantid` - UUID, validated in the controller for create, search and `mycohorts`
- `academicyearid` - UUID, validated in the controller for create, search, `mycohorts` and `geographical-hierarchy`. For `cohortHierarchy` it is read but not validated

### Caching
Read endpoints use `CacheService.getOrLoad`; TTL is 300 seconds (`COHORT_TTL_SECONDS`).

| Endpoint | Namespace | Key | Also depends on |
|----------|-----------|-----|-----------------|
| `GET /cohortHierarchy/:cohortId` | `cohort:{tenantId of the cohort row}` | `read:{cohortId}:child:cf{0/1}` or `read:{cohortId}:nochild` | `fieldsdef` |
| `POST /search` | `cohort:{tenantId}` | `search:{hash(academicYearId, body)}` | `fieldsdef` |
| `GET /mycohorts/:userId` | `cohort:{tenantId}` | `mycohorts:{userId}:child{0/1}:cf{0/1}` | `cohortmember:{tenantId}`, `fieldsdef` |

- A search with `filters.name` set bypasses the cache (free-text names are high-cardinality), all other searches are cached.
- `mycohorts` falls through uncached if no tenant is supplied.
- Responses that write an error (404/400) are never cached.
- Invalidation: create and update bump `cohort:{tenantId}`, `cfields:{cohortId}` and `userfilter`; bulk status update bumps `cohort:{tenantId}` for each affected tenant; delete bumps `cohort:{tenantId}`, `cohortmember:{tenantId}`, `cfields:{cohortId}` and `userfilter`.

### Kafka Events
Published to the topic in `KAFKA_TOPIC` (default `user-topic`), message key = `cohortId`. Publishing is fire-and-forget, runs after the HTTP response is sent and failures are only logged.

| Trigger | Event |
|---------|-------|
| Create | `COHORT_CREATED` (data: cohort columns + `academicYearId` + `customFields`), plus `COHORT_ACADEMIC_YEAR_CREATED` for the mapping row |
| Update | `COHORT_UPDATED`; and one `COHORT_MEMBER_UPDATED` per member whose status was cascaded (see Update) |
| Delete | `COHORT_DELETED` (data: `cohortId`, `deletedAt`) |

For `COHORT`/`BATCH` types the Kafka service rewrites `data.type` based on the center's `TYPE_OF_CENTER` custom field (for a batch it is looked up from the parent cohort). `PATCH /updateStatus` does not publish events.

### Audit Logs
Emitted through `AuditLoggerService` with `entityType: "COHORT"` and the actor context from `getAuditContext()` (actor id/name/role, IP, user agent from the request). An audit failure is logged and never fails the request.

| Action | `eventAction` | Metadata |
|--------|---------------|----------|
| Create | `CREATED` | `tenantId`, `academicYearId`, `name`, `type`, `status` |
| Update | `UPDATED` | `updatedFields` (the update payload), `cohortId` |
| Bulk status update | `STATUS_UPDATED` | `status`, `cohortIds` (entityId is the id when one cohort, otherwise the literal `COHORT`) |
| Delete | `DELETED` | none |

## API Endpoints

### Get Cohort Hierarchy - GET `/cohortHierarchy/:cohortId`

**API ID**: `api.cohort.read`

**Route**: `GET /user/v1/cohort/cohortHierarchy/:cohortId`

**Authentication**: Required

**Headers**:
- `academicyearid` (optional) - Academic Year ID (currently not used to filter the result)

**Query Parameters**:
- `children` (optional, string) - Set to "true" to include child cohorts
- `customField` (optional, string) - Set to "true" to include custom fields (applies to the `children` response only)

**Path Parameters**:
- `cohortId` (required) - Cohort ID

**Response**:
- Without `children=true`: `{ cohortData: [{ cohortId, name, parentId, type, customField }] }`
- With `children=true`: array of `{ cohortName, cohortId, parentId, type, status, customField (only when customField=true), childData }`

**Business Logic**: Loads the cohort, resolves the tenant from the cohort row for the cache namespace, then builds either the plain or the child hierarchy (cached 5 minutes).

**Edge Cases**:
- Cohort not found → 400 Bad Request (`Cohort not found`)

---

### Create Cohort - POST `/create`

**API ID**: `api.cohort.create`

**Route**: `POST /user/v1/cohort/create`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID) - Tenant ID
- `academicyearid` (required, UUID) - Academic Year ID
- `Authorization` (required) - JWT token (`sub` is used as `userId`)

**Request Body** (`CohortCreateDto`):
- `name` (required), `type` (required)
- `status` (optional, one of `active`, `archived`, `inactive`, `pending`; defaults to `active`)
- `parentId`, `programId`, `referenceId`, `metadata` (JSON string), `image` (string array), `customFields` (array of `{ fieldId, value }`)

**Response (201)**: `{ cohortId, parentId, name, type, status, tenantId, academicYearId, image }`

**Business Logic**:
1. Validates `tenantid` and `academicyearid` headers (UUID)
2. Extracts `userId` from the JWT, sets `createdBy` and `updatedBy`
3. Lower-cases `name`
4. Verifies the academic year is active for the tenant (`getActiveAcademicYear`)
5. Validates custom fields (context = cohort `type` or `COHORT`)
6. Defaults `status` to `active`, forces `attendanceCaptureImage = false`, stringifies object `metadata`
7. Saves the cohort, emits the audit log, saves custom field values
8. Inserts the `CohortAcademicYear` mapping (publishes `COHORT_ACADEMIC_YEAR_CREATED`)
9. Invalidates the cache, responds, then publishes `COHORT_CREATED`

**Edge Cases**:
- Missing/invalid `tenantid` or `academicyearid` → 400 Bad Request
- Academic year not active for the tenant → 404 Not Found
- Custom field validation fails → 400 Bad Request
- Duplicate name check is currently disabled in code, so duplicate cohort names under the same parent are accepted on create (the update API still enforces uniqueness)

---

### Search Cohorts - POST `/search`

**API ID**: `api.cohort.list`

**Route**: `POST /user/v1/cohort/search`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Request Body** (`CohortSearchDto`, validated with `whitelist: true`):
- `limit` (number, required), `offset` (number, required)
- `filters`: `userId`, `cohortId` (string or array, string is wrapped into an array), `name` (partial, case-insensitive `ILIKE %value%`), `parentId[]`, `type`, `status[]`, `state[]`, `district[]`, `block[]`, `village[]`, `customFieldsName` (object of custom field name to value)
- `sort`: `[field, "asc" | "desc"]` (default `name asc`)

**Response**: `{ count, results: { cohortDetails: [ ...cohort rows each with customFields ] } }`

**Business Logic**:
1. `tenantId` always comes from the header; a `tenantId` inside `filters` is ignored
2. `limit` defaults to 200 when 0/absent; more than 200 → 400
3. Requires at least one cohort mapped to the academic year within the tenant, otherwise 404 (`No cohorts available for given Academic year`)
4. Filter keys can be any `Cohort` column or custom field name; custom field filters are resolved through `filterUserUsingCustomFieldsOptimized`
5. Pagination is applied in memory (`slice(offset, offset + limit)`) after the count query
6. Results are cached 5 minutes, except when `filters.name` is present

**Edge Cases**:
- No rows → 404 `No data found.`
- Custom field filter matches nothing → 404 `No data found`

---

### Update Cohort - PUT `/update/:cohortId`

**API ID**: `api.cohort.update`

**Route**: `PUT /user/v1/cohort/update/:cohortId`

**Authentication**: Required

**Path Parameters**:
- `cohortId` (required) - Cohort ID to update

**Request Body** (`CohortUpdateDto`): `name`, `type`, `parentId`, `programId`, `referenceId`, `metadata`, `attendanceCaptureImage`, `status` (`active`, `archived`, `inactive`; `pending` is not allowed here), `customFields`. `updatedBy` is set from the JWT.

**Files**: The route accepts an optional `image` multipart file (disk storage in `IMAGEPATH`, image filter), but the file is not read by the service and is not saved on the cohort.

**Response**: Number of cohort rows affected

**Business Logic**:
1. Cohort must exist; custom fields are validated against the new or existing `type`
2. If `name` or `parentId` is supplied, another cohort with the same name and parent (excluding this cohort) must not exist
3. Non-null DTO keys are written to the `Cohort` row; custom field values are updated per field
4. Status cascade: when the new status is `active`, `inactive` or `archived` and the current status is one of the other two (transition map: archived ← active/inactive, active ← archived/inactive, inactive ← active/archived), all `CohortMembers` of the cohort are set to the matching `MemberStatus` with `updatedBy`
5. Invalidates `cohort:{tenantId}`, `cfields:{cohortId}`, `userfilter`, emits the `UPDATED` audit log
6. After the response: publishes `COHORT_UPDATED` and, for every cascaded member, `COHORT_MEMBER_UPDATED` (via `CohortMembersService.publishCohortMemberEvent`)

**Edge Cases**:
- Invalid UUID → 409 Conflict (`Invalid cohortId`)
- Cohort not found → 404 Not Found
- Name already exists under the parent → 409 Conflict
- Custom field validation fails → 400 Bad Request

---

### Bulk Update Cohort Status - PATCH `/updateStatus`

**API ID**: `api.cohort.statusUpdate`

**Route**: `PATCH /user/v1/cohort/updateStatus`

**Authentication**: Required

**Request Body** (`CohortStatusUpdateDto`):
- `cohortIds` (required, array of UUID v4)
- `status` (required, one of `active`, `inactive`, `archived`, `pending`)

**Response**: `{ affected: <rows updated> }`

**Business Logic**: De-duplicates the ids, checks every id exists, then updates `status` and `updatedBy` (from JWT) in one statement, invalidates `cohort:{tenantId}` for each affected tenant and emits a `STATUS_UPDATED` audit log.

**Edge Cases**:
- One or more ids not found → 404 Not Found (`Invalid cohortId`)

**Side Effects**: Does not change `CohortMembers` statuses and does not publish Kafka events.

---

### Delete Cohort - DELETE `/delete/:cohortId`

**API ID**: `api.cohort.delete`

**Route**: `DELETE /user/v1/cohort/delete/:cohortId`

**Authentication**: Required

**Path Parameters**:
- `cohortId` (required) - Cohort ID to delete

**Response**: Cohort deleted (message `Cohort Deleted Successfully.`)

**Business Logic**:
1. Sets the cohort `status` to `archived` and `updatedBy` to the caller (soft delete of the cohort row)
2. Hard-deletes all `CohortMembers` rows of the cohort and all `FieldValues` whose `itemId` is the cohortId
3. Invalidates `cohort:{tenantId}`, `cohortmember:{tenantId}`, `cfields:{cohortId}`, `userfilter`
4. Emits `DELETED` audit log; publishes `COHORT_DELETED` after the response

**Edge Cases**:
- Invalid UUID or cohort not found → 400 Bad Request

---

### Get User Cohorts - GET `/mycohorts/:userId`

**API ID**: `api.cohort.read`

**Route**: `GET /user/v1/cohort/mycohorts/:userId`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Query Parameters**:
- `children` (optional) - Include child cohorts
- `customField` (optional) - Include custom fields in child data

**Path Parameters**:
- `userId` (required, UUID) - User ID

**Response**: Array of `{ cohortName, cohortId, parentId, cohortMemberStatus, cohortMembershipId, cohortStatus, type, customField, childData }`

**Business Logic**: If the user has an active `AutomaticMember` rule, cohorts are resolved from the rule (cohorts whose custom field matches `rules.condition`, restricted to the academic year). Otherwise cohorts are resolved from the user's `CohortMembers` joined to `CohortAcademicYear` for the given year, regardless of member status. Cached 5 minutes; depends on `cohortmember:{tenantId}` so membership changes refresh it.

**Edge Cases**:
- No cohort for the user → 400 Bad Request (`No Cohort Found for this User ID`)

---

### Get User Geographical Hierarchy - POST `/geographical-hierarchy`

**API ID**: `api.cohort.read`

**Route**: `POST /user/v1/cohort/geographical-hierarchy`

**Authentication**: Required

**Headers**:
- `academicyearid` (required, UUID)

**Request Body** (`GeographicalHierarchySearchDto`, `whitelist: true`):
- `userId` (required, UUID)
- `filters` (optional): `parentId[]`, `cohortId` (string or array), `name` (partial), `type`, `status[]`, `state[]`, `district[]`, `block[]`, `village[]`, `customFieldsName`
- `limit` (optional, default 100, min 1), `offset` (optional, default 0, min 0)

**Response**: `{ data: [ { stateId, stateName, districts: [ { districtId, districtName, blocks: [ { blockId, blockName, centers: [ { centerId, centerName, batches: [ { batchId, batchName } ] } ] } ] } ] } ], totalCount, currentPageCount, limit, offset }`

**Business Logic**:
1. Loads the user's cohorts for the academic year and keeps only memberships with status `active` (so reassigned rows do not repeat a batch)
2. Applies cohort level filters (`parentId`, `cohortId`, `type`, `status`, `name`)
3. A `batch` contributes its parent center; a `center`/`cohort` type is used directly
4. State, district, block and village are read from the center's custom fields (label or name `state`, `district`, `block`, `village`) and the geographic filters are applied to them; `customFieldsName` is matched through `filterUserUsingCustomFields`
5. Builds State, District, Block, Center, Batch; unknown values are grouped under `null` ids with name `Unknown`
6. Pagination applies to the list of states

**Edge Cases**:
- Invalid `userId` → 404 Not Found (`Invalid input: User Id does not exist.`)
- No cohorts, or none left after filtering → 404 Not Found

**Note**: The cache strategy document lists this endpoint as cached; the service code does not currently use the cache for it.

## Common Issues & Solutions

### Issue: Cohort not appearing in search
**Solution**: Ensure `tenantid` and `academicyearid` headers are valid UUIDs, the cohort has a `CohortAcademicYear` row for the year, and the response is not a stale cached result (5 minutes; bumped on create/update/status/delete).

### Issue: Child cohorts not loading
**Solution**: Pass `children=true` query parameter and verify `parentId` relationships are correct.

### Issue: Custom fields not showing
**Solution**: Pass `customField=true` query parameter and ensure custom fields are created for the cohort.

### Issue: Cohort status change did not change members
**Solution**: Only `PUT /update/:cohortId` cascades status to members (and only for valid transitions between active, inactive and archived). `PATCH /updateStatus` changes the cohort only.

### Common Mistakes to Avoid
1. Not validating `tenantid` and `academicyearid` format
2. Missing `userId` extraction from token for audit fields
3. Not handling hierarchical relationships correctly
4. Hardcoding status values instead of using constants
5. Sending `status: "pending"` to the update API (only create and `updateStatus` allow it)
