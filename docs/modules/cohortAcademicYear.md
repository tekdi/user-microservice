# Cohort Academic Year Module

## Module Overview

The Cohort Academic Year module manages the relationship between cohorts and academic years. It handles assignment of cohorts to academic years, retrieval of cohort-academic year associations, and publishes a Kafka event whenever a mapping is created.

**Purpose**: Manage cohort-academic year associations for organizing cohorts within specific academic periods. The mapping row (`cohortAcademicYearId`) is what `CohortMembers` reference to tie a member to an academic year.

**Key Entities**:
- `CohortAcademicYear` - Maps cohorts to academic years

**Dependencies**:
- `Cohort` repository - For cohort validation
- `AcademicyearsModule` - For academic year validation (`getActiveAcademicYear`)
- `KafkaModule` - For `COHORT_ACADEMIC_YEAR_*` events

## Database Schema

### CohortAcademicYear Entity (`CohortAcademicYear`)
- `cohortAcademicYearId` (UUID, Primary Key, Auto-generated)
- `cohortId` (UUID)
- `academicYearId` (UUID)
- `createdBy`, `updatedBy` (UUID)
- `createdAt`, `updatedAt` (Date)

## Kafka Events

`KafkaService.publishCohortAcademicYearEvent(eventType, data, cohortAcademicYearId)` publishes to `KAFKA_TOPIC` (default `user-topic`) with the mapping id as message key and payload `{ eventType, timestamp, cohortAcademicYearId, data }`.

- `COHORT_ACADEMIC_YEAR_CREATED` - published by `insertCohortAcademicYear` (data = saved row + `tenantId`). It is fired from this module's create API and also whenever a cohort is created (`POST /cohort/create` inserts the mapping). Fire-and-forget; failures are logged only
- `COHORT_ACADEMIC_YEAR_UPDATED` and `COHORT_ACADEMIC_YEAR_DELETED` exist in the publisher but no code path triggers them yet

If Kafka is disabled the publisher logs a warning and returns.

## API Endpoints

### Add Cohort to Academic Year - POST `/create`

**API ID**: `api.create.cohortAcademicYear`

**Route**: `POST /user/v1/cohort-academic-year/create`

**Authentication**: A bearer token must be present because the caller id is read from the JWT `sub` (`@GetUserId`). The controller does not apply `JwtAuthGuard`

**Headers**:
- `tenantid` (UUID; validated only when supplied, but the tenant checks below need it)
- `Authorization` (required) - JWT token

**Request Body** (`CohortAcademicYearDto`):
- `cohortId` (required, UUID)
- `academicYearId` (required, UUID)

`createdBy` is set from the JWT.

**Response (200)**: Saved `CohortAcademicYear` row, message `Cohort added with academic year successfully`

**Business Logic**:
1. Cohort must exist with `status = active`
2. Cohort `tenantId` must equal the `tenantid` header
3. Academic year must be active for the tenant
4. Inserts the mapping and publishes `COHORT_ACADEMIC_YEAR_CREATED`

**Edge Cases**:
- Invalid `tenantid` format → 400 Bad Request
- Cohort not found or not active → 404 Not Found
- Cohort belongs to another tenant → 400 Bad Request (`Tenant id mismatched`)
- Academic year not active for the tenant → 404 Not Found
- Unexpected error → 500

**Side Effects**: Kafka event `COHORT_ACADEMIC_YEAR_CREATED`.

### Internal service methods
- `insertCohortAcademicYear(cohortId, academicYearId, createdBy, updatedBy, tenantId?)` - used by the Cohort module on cohort creation
- `getCohortsAcademicYear(academicYearId, tenantId)` - all mappings of an academic year, joined to `AcademicYears` to enforce the tenant (used by cohort search)
- `isCohortExistForYear(yearId, cohortId)` - mapping lookup

## Common Issues & Solutions

### Issue: Cohort not appearing in academic year
**Solution**: Verify cohort-academic year mapping exists. Check academic year ID matches and that the academic year is active for the tenant.

### Issue: Cohort member creation returns "This cohort not exist for this year"
**Solution**: Create the mapping first (this API, or create the cohort with the `academicyearid` header which inserts it automatically).

### Common Mistakes to Avoid
1. Not validating cohort and academic year existence
2. Creating duplicate mappings (there is no uniqueness check in the service)
3. Omitting the `tenantid` header
