# Forms Module

## Module Overview

The Forms module manages form definitions and form data. It handles creation, retrieval, and management of forms used in the application. A form is a JSON list of fields; core fields are stored inline, custom fields are references (`fieldId`) that are expanded from the Fields module on read.

**Purpose**: Manage form definitions and form data with support for dynamic form structures.

**Key Entities**:
- `Form` (table `forms`): `formid` (UUID PK), `title`, `tenantId` (UUID; `NULL` means a global form), `context`, `contextType`, `fields` (JSONB, shape `{ result: [...] }`), `createdBy`, `updatedBy`, `createdat`, `updatedat`

**Dependencies**:
- `FieldsModule` - For form field definitions (`getFieldData`, `getFieldsByIds`)
- `CacheService` - Caches form reads (see Caching)
- `ConfigService` - `INTERFACE_URL`, `MIDDLEWARE_URL` for placeholder replacement

## Caching

`GET /read` is cached with `CacheService.getOrLoad`:
- Namespace: `form:{tenantId}` (or `form:global` when no `tenantid` header)
- Key: `read:{context}:{contextType}`
- TTL: 1 hour
- `dependsOn: ["fieldsdef"]` - forms embed field definitions, so any field definition write (create/update field, delete option) makes cached forms stale automatically.
- Error responses (400/404/500) are never cached.
- `POST /create` invalidates `form:global` and, when a tenant header is present, `form:{tenantId}`.

## API Endpoints

### Get Form - GET `/read`

**API ID**: `api.form.read`

**Route**: `GET /user/v1/form/read`

**Authentication**: Not enforced by a guard

**Headers**:
- `tenantid` (optional) - Tenant ID. When absent, the global form (`tenantId IS NULL`) is returned.

**Query Parameters**:
- `context` (optional but one of `context`/`contextType` is required) - Upper-cased by the controller
- `contextType` (optional) - Upper-cased by the controller

**Response**: `{ formid, title, fields: [...] }`

**Business Logic**:
1. Rejects the request with 400 when neither `context` nor `contextType` is provided.
2. Validates query keys: only `context`, `contextType`, `userId` are allowed; any other key returns 400 `Invalid keys provided: ...`.
3. Validates `context` / `contextType` against the allowed set:
   - `users` -> role names from the `Roles` table (upper-cased)
   - `cohorts` -> `CohortContextType` values
   - `cohortmember` -> `COHORTMEMBER`
   - `tenant` -> `TENANT`
   - anything else -> 400 `Invalid context: <context>`
4. Loads the form by `context`, `contextType` (`NULL` when not provided) and `tenantId` (`NULL` when no header).
5. For each non-core field (`coreField` falsy) loads the full definition from `public."Fields"` by `fieldId` (with dynamic options) and merges it with the form entry, keeping the form's own `validation` and `order`.
6. Recursively replaces `{{interfaceUrl}}` and `{{middlewareUrl}}` in all string values with the `INTERFACE_URL` and `MIDDLEWARE_URL` environment variables (empty string if unset).

**Edge Cases**:
- No form for the context -> 404 `No Data found for this context OR Context Type`
- Invalid `contextType` for the context -> 400 listing the valid values
- Unexpected error -> 500 with the error message

**Dependencies**:
- `FormsService.getForm()`, `FieldsService.getFieldData()`

**Side Effects**: Cache write on first successful read.

---

### Create Form - POST `/create`

**API ID**: `api.form.create`

**Route**: `POST /user/v1/form/create`

**Authentication**: Required (Bearer token; `userId` is read from the JWT `sub` claim by `@GetUserId`)

**Headers**:
- `tenantid` (optional, UUID) - Tenant the form belongs to; invalid UUID -> 400. Empty/absent creates a global form.

**Request Body** (`FormCreateDto`):
- `title` (string, required) - stored upper-cased
- `context` (string, required) - stored upper-cased
- `contextType` (string, required) - stored upper-cased
- `fields` (object, optional, non-empty) - `{ result: [{ coreField: 0|1, fieldId, ... }] }`

**Response**: `200` with the saved form, message `Form created successfully`

**Business Logic**:
1. Sets `createdBy` from the token and `tenantId` from the header.
2. Rejects when a form already exists for the same `context` + `contextType` + `tenantId` (or `NULL`) with 400 `Form already exists`.
3. Validates `fields.result`: each custom field (`coreField === 0`) needs a non-empty `fieldId`; each core field (`coreField === 1`) must have `fieldId = null`; every referenced `fieldId` must exist in `Fields`. Otherwise 400 `Invalid form`.
4. Validates `context` / `contextType` with the same rules as the read API.
5. Saves the form and invalidates `form:global` and `form:{tenantId}`.

**Edge Cases**:
- Duplicate form -> 400
- Unknown `fieldId` or inconsistent `coreField`/`fieldId` -> 400
- Unexpected error -> 500

**Side Effects**: Inserts a `forms` row; bumps form cache namespaces.

## Common Issues & Solutions

### Issue: Form fields not appearing
**Solution**: Verify form-field associations exist. Check field definitions are correct and that each custom field entry has `coreField: 0` and a valid `fieldId`.

### Issue: Form shows old field definitions
**Solution**: Form reads depend on the `fieldsdef` cache epoch, which is bumped by field definition writes. If `CACHE_DISABLED_NAMESPACES` or the master switch is changed, entries are bypassed or re-read; otherwise the 1 hour TTL is the upper bound.

### Issue: Form read returns 400 for contextType
**Solution**: `contextType` for `users` must match a role name in the `Roles` table; for `cohorts` it must be a `CohortContextType` value.

### Common Mistakes to Avoid
1. Not associating fields with forms correctly
2. Missing form field configurations
3. Calling `/user/v1/forms/...` (the route prefix is `form`, singular)
4. Omitting `tenantid` and expecting a tenant-specific form (the global form is returned)
