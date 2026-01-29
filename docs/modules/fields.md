# Fields Module

## Module Overview

The Fields module manages custom field definitions and field values. It supports creating custom fields for different contexts (users, cohorts, etc.), managing field options, and storing/retrieving field values.

**Purpose**: Manage custom field definitions and values with support for different field types, options, and context-based filtering.

**Key Entities**:
- `Fields` - Custom field definitions
- `FieldValues` - Field values for items (users, cohorts, etc.)

**Dependencies**: None (standalone module)

## API Endpoints

### Create Field - POST `/create`

**API ID**: `api.fields.create`

**Route**: `POST /user/v1/fields/create`

**Authentication**: Required

**Request Body** (`FieldsDto`):
- `label`, `type`, `options`, `context`, `contextType`, `tenantId`, etc.

**Response**: Field created successfully

**Business Logic**: Creates a new custom field definition with specified type and options.

---

### Update Field - PATCH `/update/:fieldId`

**API ID**: `api.fields.create` (Note: Should be separate API ID)

**Route**: `PATCH /user/v1/fields/update/:fieldId`

**Authentication**: Required

**Path Parameters**:
- `fieldId` (required) - Field ID to update

**Request Body** (`FieldsUpdateDto`): Update fields

**Response**: Field updated successfully

---

### Search Fields - POST `/search`

**API ID**: `api.fields.search`

**Route**: `POST /user/v1/fields/search`

**Authentication**: Required

**Headers**:
- `tenantid` (optional) - Tenant ID for filtering

**Request Body** (`FieldsSearchDto`): Search filters

**Response**: List of fields matching criteria

**Business Logic**: Searches fields by tenant, context, type, etc.

---

### Create Field Values - POST `/values/create`

**API ID**: `api.fieldValues.create`

**Route**: `POST /user/v1/fields/values/create`

**Authentication**: Required

**Request Body** (`FieldValuesDto`):
- `itemId` (UUID) - ID of item (user, cohort, etc.)
- `fieldId` (UUID) - Field ID
- `value` (string or array) - Field value(s)
- `tenantId`, `contextType`, etc.

**Response**: Field value created successfully

**Business Logic**: Creates or updates field value for an item. Supports upsert behavior.

---

### Search Field Values - POST `/values/search`

**API ID**: `api.fieldValues.search`

**Route**: `POST /user/v1/fields/values/search`

**Authentication**: Required

**Request Body** (`FieldValuesSearchDto`): Search filters

**Response**: List of field values matching criteria

---

### Delete Field Values - DELETE `/values/delete`

**API ID**: `api.fieldValues.delete`

**Route**: `DELETE /user/v1/fields/values/delete`

**Authentication**: Required

**Request Body** (`FieldValuesDeleteDto`):
- `itemId` (UUID)
- `fieldId` (UUID)

**Response**: Field value deleted successfully

---

### Get Field Options - POST `/options/read`

**API ID**: `api.fields.options.read` (Note: Not in APIID config)

**Route**: `POST /user/v1/fields/options/read`

**Authentication**: Required

**Request Body** (`FieldsOptionsSearchDto`): Search criteria

**Response**: List of field options

---

### Delete Field Option - DELETE `/options/delete/:fieldName`

**API ID**: `api.fields.options.delete`

**Route**: `DELETE /user/v1/fields/options/delete/:fieldName`

**Authentication**: Required

**Path Parameters**:
- `fieldName` (required) - Field name

**Query Parameters**:
- `option` (optional) - Option value to delete
- `context` (optional) - Context filter
- `contextType` (optional) - Context type filter

**Response**: Field option deleted successfully

---

### Get Form Fields - GET `/formFields`

**API ID**: Not specified

**Route**: `GET /user/v1/fields/formFields`

**Authentication**: Not required

**Query Parameters**:
- `context` (optional) - Context filter
- `contextType` (optional) - Context type filter

**Response**: Form fields for specified context

## Common Issues & Solutions

### Issue: Field values not saving
**Solution**: Ensure `itemId`, `fieldId`, `tenantId`, and `contextType` are provided and valid. Check field type matches value format.

### Issue: Field options not appearing
**Solution**: Verify field type supports options (dropdown, radio, etc.) and options are created correctly.

### Issue: Field values not retrieving
**Solution**: Ensure `itemId` matches the item you're querying and `contextType` is correct.

### Common Mistakes to Avoid
1. Not providing `contextType` when creating field values
2. Mismatching field type with value format
3. Not handling array values correctly for multi-select fields
4. Missing tenant filtering in searches
