# Tenant Module

## Module Overview

The Tenant module manages tenant/program entities in the system. Tenants represent high-level groupings of users (similar to domains or programs). The module supports hierarchical tenant structures with parent-child relationships, file uploads for program images, and comprehensive search capabilities.

**Purpose**: Manage tenant creation, updates, deletion, search, and retrieval with support for hierarchical structures, status management, and file attachments.

**Key Entities**:
- `Tenant` - Core tenant entity with program information

**Dependencies**:
- `FilesUploadService` (`src/common/services/upload-file.ts`) - Uploads program images to AWS S3 (see File Uploads)
- `CacheService` - Caches tenant reads (see Caching)

## Caching

Tenant reads use `CacheService.getOrLoad` in the single namespace `tenant`, TTL 1 hour:
- `GET /read` -> key `read:all`
- `POST /search` -> key `search:{sha256(body)}`
- Error responses (404/500) are never cached.
- Tenant writes emit no Kafka event, so `create`, `update` and `delete` call `cacheService.invalidate("tenant")` after the DB write succeeds, which stales every cached read and search at once.

## File Uploads

`FilesUploadService.saveFile(file)` (used by create/update, `FilesInterceptor("programImages", 10)`):
- Allowed extensions (case-insensitive): `.jpg`, `.jpeg`, `.png`, `.gif`, `.ico`, `.webp`, `.mp4`, `.mp3`, `.pdf`, `.doc`; anything else -> 400 `Invalid file type`
- Uploads the in-memory buffer to the S3 bucket `AWS_BUCKET_NAME` (region `AWS_REGION`, credentials `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) under key `{uuid}{ext}` with the file's mimetype
- Verifies the object with `HeadObject` (zero `ContentLength` -> 500)
- Returns `{ filePath, fileSize }` where `filePath` is `https://{bucket}.s3.{region}.amazonaws.com/{key}`; the URL is what is stored in `programImages`
- S3 failure -> 500 `Failed to upload file to S3`

The separate `UploadS3Service` (`src/common/services/upload-S3.service.ts`) generates presigned POST uploads (24 h expiry, key `{folder}/{filename}-{uuid}{ext}`, content type derived from the extension) and is used by the user module, not by tenant.

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

**Request Body** (`TenantSearchDTO`; validated with `whitelist: true`, unknown properties are stripped):
```typescript
{
  filters?: {
    tenantId?: string; // UUID
    name?: string; // Case-insensitive partial search (ILIKE %value%)
    status?: ("active" | "inactive" | "archived")[]; // Non-empty array
    parentId?: string; // UUID
    type?: string;
    domain?: string;
    programHead?: string;
    createdBy?: string; // UUID
    updatedBy?: string; // UUID
  };
  limit: number; // Required, 1-200
  offset: number; // Required, 0-200
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
6. The result is cached (see Caching)

**Edge Cases**:
- No tenants match filters → 404 Not Found
- Invalid filter values (non-UUID ids, empty or invalid `status` array, `limit`/`offset` out of range) → 400 from validation
- `parentId` must be a UUID string in the DTO; the service also maps `null`/`'null'` to a parent-only filter
- Empty filters → Returns all tenants (with pagination)
- `offset` is capped at 200 by validation

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
  params?: object; // Optional (JSON string accepted in multipart requests and parsed)
  contentFilter?: object; // Optional (JSON string accepted and parsed)
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
- **Error (400)**: Validation errors, invalid file type
- **Error (404)**: `parentId` given but parent tenant not found
- **Error (409)**: Tenant with the same `name` already exists
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token using `@GetUserId` decorator (the decorator decodes the Bearer token's `sub`; it does not verify the signature)
2. Handle file uploads (if any):
   - Use `FilesInterceptor` to handle up to 10 files
   - Upload each file to S3 using `FilesUploadService.saveFile()`
   - Set `tenantCreateDto.programImages` to the returned S3 URLs
3. Set `tenantCreateDto.createdBy = userId`
4. Call `tenantService.createTenants()`, which:
   - Parses `params` and `contentFilter` from JSON strings when sent as multipart fields (a parse failure is logged and the raw value is kept)
   - Rejects duplicate `name` (409)
   - Validates `parentId` exists (404)
   - Saves the tenant (defaults: status `active`, ordering `0`)
   - Invalidates the `tenant` cache namespace
5. Return formatted response

**Edge Cases**:
- Missing required fields → 400 Bad Request (validation)
- Invalid `parentId` format → 400 Bad Request
- Duplicate name → 409 Conflict (`Tenant already exists`)
- Parent not found → 404 (`Parent tenant not found`)
- Invalid file extension → 400 from `FilesUploadService`; S3 failure → 500

**Dependencies**:
- `TenantService.createTenants()`
- `FilesUploadService.saveFile()`

**Side Effects**:
- Creates tenant record in database
- Uploads files to S3
- Invalidates the `tenant` cache namespace

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
  programImages?: string[]; // Existing URLs (array or JSON-array string) plus new uploads
  updatedBy?: string; // Auto-set from token
}
```

**Files**:
- `programImages` (multipart/form-data, optional, max 10 files) - New program images

**Response**:
- **Success (200)**: Tenant updated successfully
- **Error (400)**: Bad Request (validation, malformed `programImages`)
- **Error (404)**: Tenant Not Found / Parent tenant not found
- **Error (409)**: Duplicate name, self-parent or circular parent chain
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token
2. Extract `id` from path parameter (tenantId)
3. Normalise `programImages`: when it arrives as a string (multipart form-data) it must be a JSON array of strings, otherwise 400 (`Invalid format for programImages. Expected a JSON array string.` / `programImages must be an array of strings.`)
4. Upload any files to S3 via `FilesUploadService`; the final `programImages` is the existing list (from the body) followed by the newly uploaded URLs
5. Set `tenantUpdateDto.updatedBy = userId`
6. Call `tenantService.updateTenants()`, which:
   - Parses `params` / `contentFilter` JSON strings
   - Checks the tenant exists (404)
   - Rejects a `name` already used by another tenant (409)
   - When `parentId` is provided: rejects self-parent (409), requires the parent to exist (404), and walks up the parent chain to reject circular hierarchies (409)
   - Updates the row with the provided fields and invalidates the `tenant` cache
7. Returns `{ tenantId, updatedFields }`

**Edge Cases**:
- Tenant not found → 404 Not Found
- Invalid `id` format → 400 Bad Request (ParseUUIDPipe)
- `parentId` equal to the tenant's own id → 409 (`A tenant cannot be its own parent`)
- Circular parent chain → 409 (`Circular reference detected ...`)
- Invalid `programImages` format → 400
- Invalid file extension → 400; S3 failure → 500

**Dependencies**:
- `TenantService.updateTenants()`
- `FilesUploadService.saveFile()`

**Side Effects**:
- Updates tenant record in database
- Uploads new files to S3 (if provided)
- Invalidates the `tenant` cache namespace

---

### Delete Tenant - DELETE `/delete`

**API ID**: `api.tenant.delete`

**Route**: `DELETE /user/v1/tenant/delete`

**Authentication**: Required (via `@GetUserId` decorator)

**Headers**:
- `Authorization` (required) - JWT token

**Route parameter**: The handler declares `@Param("id")` (UUID, `ParseUUIDPipe`); the route path is `/delete` with no `:id` segment.

**Response**:
- **Success (200)**: Tenant deleted successfully
- **Error (400)**: `id` missing or not a UUID (`ParseUUIDPipe`)
- **Error (409)**: Tenant does not exist (`Tenant already exists` message) or has child tenants
- **Error (500)**: Internal Server Error

**Business Logic**:
1. Extract `userId` from JWT token
2. Extract `id` via `@Param("id")` with `ParseUUIDPipe`
3. Call `tenantService.deleteTenants()`, which:
   - Looks up the tenant by id
   - Rejects deletion when child tenants (`parentId = id`) exist
   - Hard-deletes the row (`repository.delete`); no soft delete or archival
   - Invalidates the `tenant` cache
4. Return formatted response

**Edge Cases**:
- Tenant not found → 409 Conflict (service reuses the `TENANT_EXISTS` message)
- Tenant has child tenants → 409 (`Cannot delete tenant with child tenants. Please delete or reassign child tenants first.`)
- No cascade or dependent-record check is performed in this service

**Dependencies**:
- `TenantService.deleteTenants()`

**Side Effects**:
- Deletes the tenant row
- Invalidates the `tenant` cache namespace

---

## Common Issues & Solutions

### Issue: Tenant hierarchy not displaying correctly
**Solution**: Ensure `parentId` is correctly set for child tenants. Check for orphan children (children whose parent was deleted) and handle them appropriately.

### Issue: Roles not appearing for child tenants
**Solution**: Verify roles exist in `Roles` table with matching `tenantId`. The system falls back to all roles if tenant-specific roles not found.

### Issue: File uploads failing
**Solution**: Check the extension is in the allowed list, and verify `AWS_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and bucket permissions for `FilesUploadService`.

### Issue: Tenant search not returning results
**Solution**: Check filter values match database values exactly (case-sensitive for some fields). Use `ILike` for name searches (case-insensitive).

### Issue: Circular parent-child relationships
**Solution**: Update rejects self-parenting and circular chains with 409. Create only checks that the parent exists.

### Issue: Tenant change not visible in /read or /search
**Solution**: Reads are cached for 1 hour in the `tenant` namespace and invalidated by the API writes. Direct database changes bypass invalidation; they appear after the TTL or after a `tenant` namespace bump.

### Performance Considerations
- Index `parentId` column for faster hierarchical queries
- Index `status` column for filtering active tenants
- Consider pagination for large tenant lists
- `read` and `search` are served from the `tenant` cache namespace (1 hour)

### Common Mistakes to Avoid
1. **Not validating parentId**: Always check if `parentId` exists and doesn't create circular references
2. **Missing file handling**: Always handle file uploads before processing tenant data
3. **Not checking tenant existence**: Verify tenant exists before update/delete operations
4. **Hardcoding status values**: Use `TenantStatus` enum instead of string literals
5. **Not handling orphan children**: Check for children whose parent was deleted
6. **Missing userId extraction**: Always extract `userId` from token for audit fields (`createdBy`, `updatedBy`)
7. **Not validating ordering range**: Ensure `ordering` is between 0-999999
