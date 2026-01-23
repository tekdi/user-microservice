# Cohort Members Module

## Module Overview

The Cohort Members module manages the relationship between users and cohorts. It handles assignment of users to cohorts, bulk assignments, updates, and retrieval of cohort membership information.

**Purpose**: Manage user-cohort relationships with support for academic year context, custom fields, and bulk operations.

**Key Entities**:
- `CohortMembers` - Maps users to cohorts

**Dependencies**:
- `UserModule` - For user validation
- `CohortModule` - For cohort validation
- `AcademicyearsModule` - For academic year context
- `FieldsModule` - For custom fields

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
- `userId` (UUID) - User ID
- `cohortId` (UUID) - Cohort ID
- Additional fields

**Response**: Cohort member created successfully

**Business Logic**: Creates user-cohort relationship with academic year context.

---

### Get Cohort Members - GET `/read/:cohortId`

**API ID**: `api.cohortmember.get`

**Route**: `GET /user/v1/cohortmember/read/:cohortId`

**Authentication**: Required

**Headers**:
- `tenantid` (optional)
- `academicyearid` (required, UUID)

**Query Parameters**:
- `fieldvalue` (optional) - Set to "true" to include custom fields

**Path Parameters**:
- `cohortId` (required) - Cohort ID

**Response**: List of cohort members with optional custom fields

---

### Search Cohort Members - POST `/list`

**API ID**: `api.cohortmember.list`

**Route**: `POST /user/v1/cohortmember/list`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Request Body** (`CohortMembersSearchDto`): Search filters, pagination

**Response**: Paginated list of cohort members

---

### Update Cohort Member - PUT `/update/:cohortmembershipid`

**API ID**: `api.cohortmember.update`

**Route**: `PUT /user/v1/cohortmember/update/:cohortmembershipid`

**Authentication**: Required

**Path Parameters**:
- `cohortmembershipid` (required) - Cohort membership ID

**Request Body** (`CohortMembersUpdateDto`): Update fields

**Response**: Cohort member updated successfully

---

### Delete Cohort Member - DELETE `/delete/:id`

**API ID**: `api.cohortmember.delete`

**Route**: `DELETE /user/v1/cohortmember/delete/:id`

**Authentication**: Required

**Headers**:
- `tenantid` (required)

**Path Parameters**:
- `id` (required) - Cohort membership ID

**Response**: Cohort member deleted successfully

---

### Bulk Create Cohort Members - POST `/bulkCreate`

**API ID**: `api.cohortmember.create`

**Route**: `POST /user/v1/cohortmember/bulkCreate`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `academicyearid` (required, UUID)

**Query Parameters**:
- `userId` (required, UUID) - User ID performing the action

**Request Body** (`BulkCohortMember`): Array of cohort member assignments

**Response**: Bulk cohort members created successfully

**Business Logic**: Creates multiple user-cohort relationships in a single operation.

## Common Issues & Solutions

### Issue: Cohort member not created
**Solution**: Verify `tenantId`, `academicYearId`, `userId`, and `cohortId` are valid UUIDs and exist in database.

### Issue: Bulk create fails partially
**Solution**: Check each member assignment individually. Ensure all required fields are provided and valid.

### Common Mistakes to Avoid
1. Not validating UUID formats
2. Missing academic year context
3. Not checking user/cohort existence before assignment
