# User Tenant Mapping Module

## Module Overview

The User Tenant Mapping module manages the relationship between users and tenants. It handles assignment of users to tenants, status management (active, inactive, archived), and retrieval of user-tenant relationships.

**Purpose**: Manage user-tenant associations with status tracking and multi-tenancy support.

**Key Entities**:
- `UserTenantMapping` - Maps users to tenants with status
- `Tenants` - Tenant entity (from tenant module)

**Dependencies**:
- `UserModule` - For user validation
- `TenantModule` - For tenant validation

## API Endpoints

### Create User-Tenant Mapping - POST `/create`

**API ID**: `api.assigntenant.create`

**Route**: `POST /user/v1/userTenantMapping/create`

**Authentication**: Required

**Request Body**: User ID, Tenant ID, status, etc.

**Response**: User-tenant mapping created successfully

**Business Logic**: Creates relationship between user and tenant with specified status.

---

### Update User-Tenant Status - PATCH `/updateStatus`

**API ID**: `api.assigntenant.updatestatus`

**Route**: `PATCH /user/v1/userTenantMapping/updateStatus`

**Authentication**: Required

**Request Body**: User ID, Tenant ID, new status

**Response**: Status updated successfully

**Business Logic**: Updates status of user-tenant relationship (active, inactive, archived).

## Common Issues & Solutions

### Issue: User not appearing in tenant
**Solution**: Verify user-tenant mapping exists with active status. Check tenant filtering in queries.

### Issue: Status update fails
**Solution**: Ensure user-tenant mapping exists and new status is valid (active, inactive, archived).

### Common Mistakes to Avoid
1. Not checking mapping existence before update
2. Missing status validation
3. Not filtering by tenant in queries
