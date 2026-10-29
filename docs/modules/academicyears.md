# Academic Years Module

## Module Overview

The Academic Years module manages academic year entities. Academic years define time periods for educational programs and are used to organize cohorts, users, and other time-bound data. Each tenant has at most one active academic year at a time; creating a new year deactivates the previous active one.

**Purpose**: Manage academic year creation, retrieval, and search with date validation and tenant association.

**Key Entities**:
- `AcademicYear` - Academic year entity with start and end dates, a derived session label and an active flag (table `AcademicYears`)

**Dependencies**:
- `Tenants` repository - To verify the tenant exists on create
- Exported `AcademicYearService.getActiveAcademicYear(academicYearId, tenantId)` is used by the Cohort, CohortAcademicYear and CohortMembers modules to reject inactive or foreign-tenant years

All routes use `JwtAuthGuard` and are served under `user/v1/academicyears`. The module has no Kafka events, audit logs or cache usage.

## Database Schema

### AcademicYear Entity (`AcademicYears`)
- `id` (UUID, Primary Key, Auto-generated)
- `startDate` (Date), `endDate` (Date)
- `session` (varchar(15)) - Computed on create as `{startYear}-{endYear}` (e.g. `2026-2027`)
- `isActive` (Boolean, default `true`) - The only status field; an academic year is either active or inactive
- `tenantId` (UUID, Required)
- `createdBy`, `updatedBy` (UUID, Nullable)
- `createdAt`, `updatedAt` (Timestamp)

## API Endpoints

### Create Academic Year - POST `/create`

**API ID**: `api.academicyear.create`

**Route**: `POST /user/v1/academicyears/create`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID) - Tenant ID
- `Authorization` (required) - JWT token

**Request Body** (`AcademicYearDto`):
```typescript
{
  startDate: string; // Required, ISO date (YYYY-MM-DD), must not be before today
  endDate: string; // Required, ISO date, must be after startDate
  createdBy: string; // Required, UUID v4
  updatedBy: string; // Required, UUID v4
}
```
`session`, `tenantId` and `isActive` are set by the service.

**Response**:
- **Success (201)**: Academic year created successfully (the saved row)
- **Error (400)**: Validation errors, tenant not found, or an overlapping active year exists
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Controller validates `tenantid` is a UUID
2. `DateValidationPipe` validates the dates (start date is not in the past, end date is after start date)
3. Builds `session` from the start and end years and sets `tenantId`
4. Verifies the tenant exists
5. Rejects the request if the tenant already has an active academic year whose date range overlaps the new range
6. Deactivates the tenant's current active year (`isActive = false`, `updatedBy` = request `updatedBy`)
7. Saves the new year (active)

**Edge Cases**:
- Invalid `tenantid` → 400 Bad Request
- Start date before today → 400 Bad Request
- End date on or before start date → 400 Bad Request
- Tenant not found → 400 Bad Request (`Tenant not found`)
- Overlapping active academic year → 400 Bad Request (`Academic Year Already Exist`)

---

### Get Academic Year List - POST `/list`

**API ID**: `api.academicyear.list`

**Route**: `POST /user/v1/academicyears/list`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `Authorization` (required) - JWT token

**Request Body** (`AcademicYearSearchDto`):
- `isActive` (optional, boolean) - when omitted all years of the tenant are returned

**Response**: Array of academic years for the tenant (no pagination or sorting)

**Business Logic**: Finds academic years by `tenantId` (and `isActive` when supplied).

**Edge Cases**:
- Invalid `tenantid` → 400 Bad Request
- No years found → 400 Bad Request (`Academic Year Not Found`)

---

### Get Academic Year by ID - GET `/:id`

**API ID**: `api.academicyear.get`

**Route**: `GET /user/v1/academicyears/:id`

**Authentication**: Required

**Path Parameters**:
- `id` (required, UUID) - Academic Year ID (validated with `ParseUUIDPipe`)

**Response**: Academic year details

**Business Logic**: Retrieves academic year by ID. No tenant filter is applied.

**Edge Cases**:
- Not found → 400 Bad Request (`Academic Year Not Found`)

## How Other Modules Use Academic Years

- `POST /cohort/create`, `POST /cohortmember/create`, `POST /cohortmember/bulkCreate` and `POST /cohort-academic-year/create` call `getActiveAcademicYear`; an inactive year (or one belonging to another tenant) returns 404 `Academic Year Not Found`
- Cohort and cohort member reads are scoped through `CohortAcademicYear` rows keyed by `academicYearId`

## Common Issues & Solutions

### Issue: Academic year creation fails with date validation
**Solution**: Ensure start date is today or later and end date is after the start date. Use ISO date format (`YYYY-MM-DD`).

### Issue: Academic year not appearing in list
**Solution**: Verify `tenantid` is correct and matches the academic year's tenant. If `isActive` is sent, only years with that flag are returned.

### Issue: "Academic Year Already Exist" on create
**Solution**: The tenant already has an active year whose dates overlap the requested range. Use dates that start after the active year ends.

### Issue: Cohort or member APIs return "Academic Year Not Found"
**Solution**: Only the active academic year of the tenant is accepted. Check the id passed in `academicyearid`.

### Common Mistakes to Avoid
1. Not validating date constraints
2. Missing tenant ID validation
3. Omitting `createdBy` / `updatedBy` (both required UUIDs)
4. Using incorrect date format
