# Academic Years Module

## Module Overview

The Academic Years module manages academic year entities. Academic years define time periods for educational programs and are used to organize cohorts, users, and other time-bound data.

**Purpose**: Manage academic year creation, retrieval, and search with date validation and tenant association.

**Key Entities**:
- `AcademicYear` - Academic year entity with start and end dates

**Dependencies**:
- `TenantModule` - For tenant context

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
  name: string; // Required
  startDate: string; // Required, ISO date string, not in future
  endDate: string; // Required, ISO date string, not before startDate
  // Additional fields
}
```

**Response**:
- **Success (201)**: Academic year created successfully
- **Error (400)**: Validation errors (invalid dates, tenant ID)
- **Error (409)**: Academic year already exists
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Validates `tenantId` format (must be valid UUID)
2. Validates date format and constraints:
   - Start date not in future
   - End date not before start date
3. Checks if academic year already exists for tenant
4. Creates academic year record
5. Returns formatted response

**Edge Cases**:
- Invalid `tenantId` format → 400 Bad Request
- Start date in future → 400 Bad Request
- End date before start date → 400 Bad Request
- Academic year already exists → 409 Conflict

---

### Get Academic Year List - POST `/list`

**API ID**: `api.academicyear.list`

**Route**: `POST /user/v1/academicyears/list`

**Authentication**: Required

**Headers**:
- `tenantid` (required, UUID)
- `Authorization` (required) - JWT token

**Request Body** (`AcademicYearSearchDto`):
- Search filters, pagination, sorting

**Response**: Paginated list of academic years

**Business Logic**: Searches academic years with filters, filtered by tenant.

---

### Get Academic Year by ID - GET `/:id`

**API ID**: `api.academicyear.get`

**Route**: `GET /user/v1/academicyears/:id`

**Authentication**: Required

**Path Parameters**:
- `id` (required, UUID) - Academic Year ID

**Response**: Academic year details

**Business Logic**: Retrieves academic year by ID.

## Common Issues & Solutions

### Issue: Academic year creation fails with date validation
**Solution**: Ensure start date is not in future and end date is not before start date. Use ISO date format.

### Issue: Academic year not appearing in list
**Solution**: Verify `tenantId` is correct and matches the academic year's tenant association.

### Issue: Duplicate academic year error
**Solution**: Check if academic year with same name/dates already exists for the tenant.

### Common Mistakes to Avoid
1. Not validating date constraints
2. Missing tenant ID validation
3. Not checking for duplicate academic years
4. Using incorrect date format
