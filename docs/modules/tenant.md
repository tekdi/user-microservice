# Tenant Module

## Module Overview

The Tenant module manages tenant/program entities in the system. Tenants represent high-level groupings of users (similar to domains or programs). The module supports hierarchical tenant structures with parent-child relationships, file uploads for program images, and comprehensive search capabilities.

**Purpose**: Manage tenant creation, updates, deletion, search, and retrieval with support for hierarchical structures, status management, and file attachments.

**Key Entities**:
- `Tenant` - Core tenant entity with program information

**Dependencies**:
- `FilesUploadService` - For handling file uploads (program images)

## Database Schema

### Tenant Entity
- `tenantId` (UUID, Primary Key, Auto-generated)
- `name` (Text, Required) - Tenant/program name
- `type` (Text, Nullable) - Tenant type
- `domain` (Text, Nullable) - Tenant domain
- `description` (Text, Required) - Tenant description
- `programHead` (Text, Nullable) - Program head identifier
- `status` (Enum: active, inactive, archived, Default: active)
- `ordering` (Integer, 0-999999, Default: 0) - Display ordering
- `parentId` (UUID, Nullable) - Parent tenant ID for hierarchical structure
- `params` (JSONB, Nullable) - Additional parameters
- `programImages` (JSON Array, Nullable) - Array of program image file paths
- `contentFramework` (Text, Required)
- `channelId` (Text, Required)
- `collectionFramework` (Text, Required)
- `templateId` (Varchar(255), Nullable)
- `contentFilter` (JSON, Nullable)
- `createdBy` (UUID, Nullable) - User ID who created
- `updatedBy` (UUID, Nullable) - User ID who last updated
- `createdAt` (Timestamp with timezone)
- `updatedAt` (Timestamp with timezone)

### Relationships
- Self-referential: `Tenant` → `Tenant` (via `parentId` for hierarchical structure)

## API Endpoints

### Get Tenants - GET `/read`

**API ID**: `api.tenant.list`

**Route**: `GET /user/v1/tenant/read`

**Authentication**: Not required

**Headers**: None

**Request**: None (GET request)

**Response**:
- **Success (200)**: List of active tenants with hierarchical structure
  ```json
  {
    "id": "api.tenant.list",
    "ver": "1.0",
    "params": {
      "status": "successful",
      "successmessage": "Tenants retrieved successfully"
    },
    "responseCode": 200,
    "result": [
      {
        "tenantId": "uuid",
        "name": "Tenant Name",
        "children": [...], // Child tenants
        "role": [...] // Roles (only for child tenants)
      }
    ]
  }
  ```
- **Error (404)**: No tenants found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Query all tenants with `status = ACTIVE`
2. Separate parents (no `parentId`) and children (has `parentId`)
3. For child tenants, fetch associated roles from `Roles` table
4. Build hierarchical structure by attaching children to parents
5. Handle orphan children (children whose parent doesn't exist)
6. Return grouped result with parent-child relationships

**Edge Cases**:
- No active tenants → 404 Not Found
- Orphan children (parent deleted) → Included in result separately
- Parent tenants don't have roles → `role` field set to `null`

**Dependencies**:
- `TenantService.getTenants()`
- Direct SQL query to `Roles` table

**Side Effects**: None

---

### Search Tenants - POST `/search`

**API ID**: `api.tenant.search`

**Route**: `POST /user/v1/tenant/search`

**Authentication**: Not required

**Request Body** (`TenantSearchDTO`):
```typescript
{
  filters?: {
    name?: string; // Case-insensitive search
    status?: ("active" | "inactive" | "archived") | ("active" | "inactive" | "archived")[];
    parentId?: string | null; // UUID or null for parent tenants
    type?: string;
    domain?: string;
    // ... other filter fields
  };
  limit?: number; // Default: 10
  offset?: number; // Default: 0
}
```

**Response**:
- **Success (200)**: Filtered tenant list with pagination
  ```json
  {
    "id": "api.tenant.search",
    "params": {
      "status": "successful",
      "successmessage": "Tenant search successful"
    },
    "responseCode": 200,
    "result": {
      "getTenantDetails": [...tenants],
      "totalCount": 100
    }
  }
  ```
- **Error (404)**: No tenants found matching filters
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `filters`, `limit`, and `offset` from request body
2. Build WHERE clause based on filters:
   - `name`: Case-insensitive search using `ILike`
   - `status`: Exact match or array match using `In()`
   - `parentId`: Handle null values for parent tenants
   - Other fields: Direct equality match
3. Query tenants with pagination (`take` and `skip`)
4. Get total count for pagination metadata
5. Return results with total count

**Edge Cases**:
- No tenants match filters → 404 Not Found
- Invalid filter values → Handled by validation
- `parentId = null` filter → Returns only parent tenants
- Empty filters → Returns all tenants (with pagination)

**Dependencies**:
- `TenantService.searchTenants()`

**Side Effects**: None

---

### Create Tenant - POST `/create`

**API ID**: `api.tenant.create`

**Route**: `POST /user/v1/tenant/create`

**Authentication**: Required (via `@GetUserId` decorator)

**Headers**:
- `Authorization` (required) - JWT token for extracting userId

**Request Body** (`TenantCreateDto`):
```typescript
{
  name: string; // Required
  type?: string; // Optional
  domain?: string; // Optional
  description: string; // Required
  programHead: string; // Required
  parentId?: string; // Optional, UUID
  params?: object; // Optional
  contentFilter?: object; // Optional
  programImages?: string[]; // Optional, set automatically from file uploads
}
```

**Files**:
- `programImages` (multipart/form-data, optional, max 10 files) - Program images

**Response**:
- **Success (201)**: Tenant created successfully
  ```json
  {
    "id": "api.tenant.create",
    "params": {
      "status": "successful",
      "successmessage": "Tenant created successfully"
    },
    "responseCode": 201,
    "result": {
      "tenantId": "uuid",
      // Tenant data
    }
  }
  ```
- **Error (400)**: Validation errors
- **Error (403)**: Forbidden
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token using `@GetUserId` decorator
2. Handle file uploads (if any):
   - Use `FilesInterceptor` to handle up to 10 files
   - Upload each file using `FilesUploadService.saveFile()`
   - Collect file paths into array
   - Set `tenantCreateDto.programImages` with file paths
3. Set `tenantCreateDto.createdBy = userId`
4. Call `tenantService.createTenants()` with:
   - `TenantCreateDto`
   - Response object
5. Service performs:
   - Validate required fields
   - Create tenant record in database
   - Set default values (status: ACTIVE, ordering: 0)
6. Return formatted response

**Edge Cases**:
- Missing required fields → 400 Bad Request (validation)
- Invalid `parentId` format → 400 Bad Request
- File upload fails → 500 Internal Server Error
- Invalid file type/size → Handled by file upload service

**Dependencies**:
- `TenantService.createTenants()`
- `FilesUploadService.saveFile()`

**Side Effects**:
- Creates tenant record in database
- Uploads files to file system

---

### Update Tenant - PATCH `/update/:id`

**API ID**: `api.tenant.update`

**Route**: `PATCH /user/v1/tenant/update/:id`

**Authentication**: Required (via `@GetUserId` decorator)

**Headers**:
- `Authorization` (required) - JWT token

**Path Parameters**:
- `id` (required, UUID) - Tenant ID to update

**Request Body** (`TenantUpdateDto`):
```typescript
{
  name?: string;
  type?: string;
  domain?: string;
  description?: string;
  programHead?: string;
  parentId?: string;
  status?: "active" | "inactive" | "archived";
  ordering?: number; // 0-999999
  params?: object;
  contentFilter?: object;
  programImages?: string[]; // Set automatically from file uploads
  updatedBy?: string; // Auto-set from token
}
```

**Files**:
- `programImages` (multipart/form-data, optional, max 10 files) - New program images

**Response**:
- **Success (200)**: Tenant updated successfully
- **Error (400)**: Bad Request
- **Error (404)**: Tenant Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token
2. Extract `id` from path parameter (tenantId)
3. Handle file uploads (if any):
   - Upload files using `FilesUploadService`
   - Set `tenantUpdateDto.programImages` with new file paths
4. Set `tenantUpdateDto.updatedBy = userId`
5. Call `tenantService.updateTenants()` with:
   - `tenantId`
   - `TenantUpdateDto`
   - Response object
6. Service performs:
   - Check if tenant exists
   - Update tenant record with provided fields
   - Preserve existing values for fields not provided
7. Return formatted response

**Edge Cases**:
- Tenant not found → 404 Not Found
- Invalid `id` format → 400 Bad Request (ParseUUIDPipe)
- Invalid `parentId` (creates circular reference) → 400 Bad Request
- File upload fails → 500 Internal Server Error

**Dependencies**:
- `TenantService.updateTenants()`
- `FilesUploadService.saveFile()`

**Side Effects**:
- Updates tenant record in database
- Uploads new files (if provided)

---

### Delete Tenant - DELETE `/delete`

**API ID**: `api.tenant.delete`

**Route**: `DELETE /user/v1/tenant/delete`

**Authentication**: Required (via `@GetUserId` decorator)

**Headers**:
- `Authorization` (required) - JWT token

**Path Parameters**:
- `id` (required, UUID) - Tenant ID to delete

**Note**: The controller method signature shows `@Param("id")` but the route doesn't include `:id`. This appears to be a code inconsistency that should be fixed.

**Response**:
- **Success (200)**: Tenant deleted successfully
- **Error (400)**: Bad Request
- **Error (404)**: Tenant Not Found
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token
2. Extract `id` from path parameter (tenantId)
3. Call `tenantService.deleteTenants()` with:
   - Request object
   - `tenantId`
   - Response object
4. Service performs:
   - Check if tenant exists
   - Check for dependent records (users, cohorts, etc.)
   - Soft delete or hard delete based on business rules
   - Update status to ARCHIVED (if soft delete)
5. Return formatted response

**Edge Cases**:
- Tenant not found → 404 Not Found
- Tenant has dependent records → 400 Bad Request (or handle cascade)
- Invalid `id` format → 400 Bad Request

**Dependencies**:
- `TenantService.deleteTenants()`

**Side Effects**:
- Deletes or archives tenant record
- May cascade delete/update dependent records

---

## Common Issues & Solutions

### Issue: Tenant hierarchy not displaying correctly
**Solution**: Ensure `parentId` is correctly set for child tenants. Check for orphan children (children whose parent was deleted) and handle them appropriately.

### Issue: Roles not appearing for child tenants
**Solution**: Verify roles exist in `Roles` table with matching `tenantId`. The system falls back to all roles if tenant-specific roles not found.

### Issue: File uploads failing
**Solution**: Check file size limits, file type restrictions, and file system permissions. Verify `FilesUploadService` configuration.

### Issue: Tenant search not returning results
**Solution**: Check filter values match database values exactly (case-sensitive for some fields). Use `ILike` for name searches (case-insensitive).

### Issue: Circular parent-child relationships
**Solution**: Validate `parentId` before update to prevent circular references. Check that a tenant's `parentId` doesn't point to itself or its descendants.

### Performance Considerations
- Index `parentId` column for faster hierarchical queries
- Index `status` column for filtering active tenants
- Consider pagination for large tenant lists
- Cache frequently accessed tenant data if needed

### Common Mistakes to Avoid
1. **Not validating parentId**: Always check if `parentId` exists and doesn't create circular references
2. **Missing file handling**: Always handle file uploads before processing tenant data
3. **Not checking tenant existence**: Verify tenant exists before update/delete operations
4. **Hardcoding status values**: Use `TenantStatus` enum instead of string literals
5. **Not handling orphan children**: Check for children whose parent was deleted
6. **Missing userId extraction**: Always extract `userId` from token for audit fields (`createdBy`, `updatedBy`)
7. **Not validating ordering range**: Ensure `ordering` is between 0-999999
