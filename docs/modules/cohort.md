# Cohort Module

## Module Overview

The Cohort module manages cohort entities, which represent granular groupings of users based on common attributes (e.g., classes, batches, groups). Cohorts support hierarchical structures with parent-child relationships and are associated with academic years and tenants.

**Purpose**: Manage cohort creation, updates, deletion, search, and retrieval with support for hierarchical structures, academic year associations, and custom fields.

**Key Entities**:
- `Cohort` - Core cohort entity
- `CohortAcademicYear` - Maps cohorts to academic years

**Dependencies**:
- `AcademicyearsModule` - For academic year validation
- `CohortAcademicYearModule` - For cohort-academic year mappings
- `FieldsModule` - For custom fields

## Database Schema

### Cohort Entity
- `cohortId` (UUID, Primary Key, Auto-generated)
- `parentId` (String, Nullable) - Parent cohort ID for hierarchy
- `name` (String, Nullable) - Cohort name
- `type` (String, Nullable) - Cohort type
- `status` (String, Required) - Cohort status
- `image` (JSON Array, Nullable) - Array of image file paths
- `referenceId` (String, Nullable) - Reference identifier
- `metadata` (String, Nullable) - Additional metadata
- `tenantId` (String, Nullable) - Associated tenant ID
- `programId` (String, Nullable) - Associated program ID
- `attendanceCaptureImage` (Boolean, Required) - Whether to capture attendance images
- `createdBy`, `updatedBy` (String, Required) - User IDs
- `createdAt`, `updatedAt` (Timestamp with timezone)

## API Endpoints

### Get Cohort Hierarchy - GET `/cohortHierarchy/:cohortId`

**API ID**: `api.cohort.read`

**Route**: `GET /user/v1/cohort/cohortHierarchy/:cohortId`

**Authentication**: Required

**Headers**:
- `academicyearid` (optional) - Academic Year ID

**Query Parameters**:
- `children` (optional, string) - Set to "true" to include child cohorts
- `customField` (optional, string) - Set to "true" to include custom fields

**Path Parameters**:
- `cohortId` (required) - Cohort ID

**Response**: Cohort details with optional children and custom fields

**Business Logic**: Retrieves cohort details, optionally includes child cohorts and custom fields based on query parameters.

---

### Create Cohort - POST `/create`

**API ID**: `api.cohort.create`

**Route**: `POST /user/v1/cohort/create`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID) - Tenant ID
- `academicyearid` (required, UUID) - Academic Year ID
- `Authorization` (required) - JWT token

**Request Body** (`CohortCreateDto`):
- `name`, `type`, `status`, `parentId`, `referenceId`, `metadata`, `image`, `attendanceCaptureImage`, etc.

**Response**: Cohort created successfully

**Business Logic**:
1. Validates `tenantId` and `academicYearId` (must be valid UUIDs)
2. Extracts `userId` from JWT token
3. Sets `createdBy` and `updatedBy` to `userId`
4. Creates cohort record
5. Associates cohort with academic year

**Edge Cases**:
- Invalid `tenantId` or `academicYearId` → 400 Bad Request
- Cohort already exists → 409 Conflict

---

### Search Cohorts - POST `/search`

**API ID**: `api.cohort.list`

**Route**: `POST /user/v1/cohort/search`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Request Body** (`CohortSearchDto`): Search filters, pagination, sorting

**Response**: Paginated list of cohorts

**Business Logic**: Searches cohorts with filters, pagination, and sorting, filtered by tenant and academic year.

---

### Update Cohort - PUT `/update/:cohortId`

**API ID**: `api.cohort.update`

**Route**: `PUT /user/v1/cohort/update/:cohortId`

**Authentication**: Required

**Path Parameters**:
- `cohortId` (required) - Cohort ID to update

**Request Body** (`CohortUpdateDto`): Update fields

**Files**: Optional image upload

**Response**: Cohort updated successfully

---

### Delete Cohort - DELETE `/delete/:cohortId`

**API ID**: `api.cohort.delete`

**Route**: `DELETE /user/v1/cohort/delete/:cohortId`

**Authentication**: Required

**Path Parameters**:
- `cohortId` (required) - Cohort ID to delete

**Response**: Cohort status updated (soft delete)

**Business Logic**: Updates cohort status instead of hard delete.

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
- `customField` (optional) - Include custom fields

**Path Parameters**:
- `userId` (required, UUID) - User ID

**Response**: User's cohorts with hierarchy

---

### Get User Geographical Hierarchy - GET `/geographical-hierarchy/:userId`

**API ID**: `api.cohort.read`

**Route**: `GET /user/v1/cohort/geographical-hierarchy/:userId`

**Authentication**: Required

**Headers**:
- `academicyearid` (required, UUID)

**Path Parameters**:
- `userId` (required, UUID) - User ID

**Response**: User's geographical hierarchy based on cohorts

## Common Issues & Solutions

### Issue: Cohort not appearing in search
**Solution**: Ensure `tenantId` and `academicYearId` are valid UUIDs and match the cohort's associations.

### Issue: Child cohorts not loading
**Solution**: Pass `children=true` query parameter and verify `parentId` relationships are correct.

### Issue: Custom fields not showing
**Solution**: Pass `customField=true` query parameter and ensure custom fields are created for the cohort.

### Common Mistakes to Avoid
1. Not validating `tenantId` and `academicYearId` format
2. Missing `userId` extraction from token for audit fields
3. Not handling hierarchical relationships correctly
4. Hardcoding status values instead of using constants
