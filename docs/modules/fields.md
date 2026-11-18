# Fields Module

## Module Overview

The Fields module manages custom field definitions and field values. It supports creating custom fields for different contexts (users, cohorts, etc.), managing field options, and storing/retrieving field values.

**Purpose**: Manage custom field definitions and values with support for different field types, options, and context-based filtering.

**Key Entities**:
- `Fields` - Custom field definitions
- `FieldValues` - Field values for items (users, cohorts, etc.)

**Dependencies**:
- `CacheService` - Versioned-namespace caching of field definitions, option lists and per-owner custom field values (see `docs/CACHING_STRATEGY.md`)
- `AuditLoggerService` (`@tekdi/audit-logger/nestjs`) - Emits `FIELD_VALUE` audit events

**Supported field types** (`FieldFactory`): `text`, `numeric`, `radio`, `drop_down`, `checkbox`, `json`, `file`. The `file` type accepts a string or an array of strings (file URLs/paths); it is used for consent files. Note that the `FieldType` enum used by `FieldsDto` (`@IsEnum`) lists only `text`, `numeric`, `radio`, `drop_down`, `checkbox`, `json`.

**SQL identifier validation**: Table and column names cannot be bound as parameters, so any identifier built from request/stored data and interpolated into raw SQL is checked against `/^[a-zA-Z0-9_]+$/` (`FieldsService.isValidSqlIdentifier`) first. This applies to `sourceDetails.table` (create/update field, delete option, `findDynamicOptions`, source-table insert/update helpers), `fieldName` and `sort[0]` in options/read. Failure returns `400 BAD_REQUEST` (`Error: Invalid source table name.`, `Error: Invalid fieldName.`, `Error: Invalid sort field.`) or, in the helpers, throws / returns `null`. Option values themselves are passed as bind parameters (`$1`, `$2`).

## Caching

Reads are cached through `CacheService.getOrLoad` / `bulkGetOrLoad`. Error responses are never cached (the loader returns `null` when a response was already written). Cache failures fall back to the database.

| Read | Namespace | Key | TTL | Also depends on |
|---|---|---|---|---|
| `POST /search` | `fields:{tenantId or global}` | `search:{sha256(body)}` | 1 h | `fieldsdef` |
| `POST /options/read` | `fields:global` | `options:{sha256(body)}` | 1 h | `fieldsdef` |
| `GET /formFields` | `fields:global` | `formFields:{context}:{contextType}` | 1 h | `fieldsdef` |
| Bulk user custom fields (`getBulkCustomFieldDetails`, table `Users`) | `ufields:{userId}` | `data` | 1 h | `fieldsdef` |
| Bulk cohort custom fields (table `Cohort`) | `cfields:{cohortId}` | `data` | 1 h | `fieldsdef` |
| `filterUserUsingCustomFieldsOptimized` (user search, cohort search, navapatham cron) | `userfilter` | `{context}:{sha256(filters)}` | 5 min | none |

`ufields`/`cfields` are loaded with one bulk read (two Redis round trips for N ids); only ids that miss hit the database. Empty/null results (for example a `null` from the user filter) are not cached.

**Invalidation**
- Field definition writes (`create`, `update/:fieldId`, `options/delete/:fieldName`) call `invalidateFieldDefinitionCaches`, which bumps `fieldsdef` (global epoch that stales every dependent read across all tenants: ufields, cfields, cohort, cohortmember, fields, form), `fields:global`, `form:global`, and `fields:{tenantId}` / `form:{tenantId}` when the field has a tenant.
- Field value writes (`values/create`, `values/delete`) bump `ufields:{itemId}`, `cfields:{itemId}`, `userfilter`, and `userlist:{tenantId}` for every tenant the item maps to (looked up from `UserTenantMapping`; the lookup never throws, a failure only loses the `userlist` bump, bounded by its TTL).
- Other modules (user update, SSO, user-tenant mapping) bump `ufields:{userId}` and `userfilter` when they change field values.

## API Endpoints

### Create Field - POST `/create`

**API ID**: `api.fields.create`

**Route**: `POST /user/v1/fields/create`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`FieldsDto`):
- `name`, `label`, `type` (enum, validated), `ordering`, `context`, `contextType`, `tenantId`, `fieldParams`, `fieldAttributes`, `sourceDetails`, `dependsOn`

**Response**: `201` with `{ result, error }`. `error` is a non-empty string when options of a dependent field were given without `controllingfieldfk`.

**Business Logic**:
1. Reads `createdBy`/`updatedBy` from the JWT (`sub`). Empty values are dropped; arrays are JSON-stringified (except `render`); `required` is forced to `true`.
2. If `sourceDetails.source = "table"` and `fieldParams` is present: validates `sourceDetails.table` as a SQL identifier, then for each option checks the source table by `value`:
   - missing and `fieldParams.isCreate` falsy -> 400 (code does not exist in the table)
   - missing and `isCreate` true -> inserts the row (`createSourceDetailsTableFields`)
   - present and `isCreate` true -> 409
   - present and `isCreate` falsy -> updates the row (`updateSourceDetailsTableFields`)
   - `fieldParams` is then removed from the stored field.
3. Saves the field and invalidates field definition caches.

**Edge Cases**:
- Invalid `sourceDetails.table` -> 400 `Error: Invalid source table name.`
- Duplicate `context` + `contextType` + `name` is checked and answered with `409 CONFLICT` `Fields already exist`

---

### Update Field - PATCH `/update/:fieldId`

**API ID**: `api.fields.create` (reused; no dedicated update ID exists in `APIID`)

**Route**: `PATCH /user/v1/fields/update/:fieldId`

**Authentication**: Not enforced by a guard on this route (the handler reads the JWT from the request context to get `createdBy`/`updatedBy`)

**Path Parameters**:
- `fieldId` (required) - Field ID to update

**Request Body** (`FieldsUpdateDto`): Update fields

**Response**: `201` Field updated successfully

**Business Logic**:
1. Loads the existing field; `type` defaults to the stored type.
2. `sourceDetails.source = "table"` with `fieldParams.options`: same per-option create/update/conflict rules as create, against the stored `sourceDetails.table` (identifier validated).
3. `sourceDetails.source = "fieldparams"`: each option not already present (`fieldParams -> 'options' @> [{value}]`) is appended to the stored `fieldParams.options`.
4. Updates the row and invalidates field definition caches (bumps `fieldsdef`).

---

### Search Fields - POST `/search`

**API ID**: `api.fields.search`

**Route**: `POST /user/v1/fields/search`

**Authentication**: Not enforced by a guard

**Headers**:
- `tenantid` (optional) - Tenant ID. When absent only global fields (`tenantId IS NULL`) are returned.

**Request Body** (`FieldsSearchDto`): `limit` (default 20), `offset` (default 0), `filters` (`context`, `contextType`, `fieldId` (UUID), `name`, `type`, `tenantId`; keys must be `Fields` columns)

**Response**: `200` array of mapped fields (`label`, `name`, `type`, `coreField: 0`, `isRequired`, `isEditable`, `isHidden`, `isPIIField`, `placeholder`, `validation`, `options`, `isMultiSelect`, `maxSelections`, `hint`, `pattern`, `maxLength`, `minLength`, `fieldId`, `dependsOn`, `sourceDetails`, `ordering`, `default`). `404` when nothing matches.

**Business Logic**: Builds a WHERE clause from the tenant header and filters, loads field rows, and for fields whose options come from a table or json file and have no `dependsOn`, attaches `fieldParams.options` from `findDynamicOptions`. Cached (see Caching).

---

### Create Field Values - POST `/values/create`

**API ID**: `api.fieldValues.create`

**Route**: `POST /user/v1/fields/values/create`

**Request Body** (`FieldValuesDto`):
- `itemId` (UUID) - ID of item (user, cohort, etc.)
- `fieldId` (UUID) - Field ID
- `value` (string or array) - Field value(s)
- `tenantId`, `contextType`, etc.

**Response**: Field value created successfully

**Business Logic**: Inserts a value for (`itemId`, `fieldId`) unless one already exists. An existing pair is not updated; the endpoint responds `404` `Fields not found or already exist` (updates go through the user/cohort update APIs, which call `updateCustomFields`). On success it invalidates `ufields`, `cfields`, `userfilter` and `userlist` caches and emits a `FIELD_VALUE` / `CREATED` audit event (`entityId: "MULTIPLE"`, metadata `fieldId`, `itemId`, `value`).

**Authentication**: Required (`JwtAuthGuard`); responses use `201`.

---

### Search Field Values - POST `/values/search`

**API ID**: `api.fieldValues.search`

**Route**: `POST /user/v1/fields/values/search`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`FieldValuesSearchDto`): `limit`, `page`, `filters` (column equality filters such as `itemId`, `fieldId`)

**Response**: `{ totalCount, fields }`. Not cached.

---

### Delete Field Values - DELETE `/values/delete`

**API ID**: `api.fieldValues.delete`

**Route**: `DELETE /user/v1/fields/values/delete`

**Authentication**: Required (`JwtAuthGuard`)

**Request Body** (`FieldValuesDeleteDto`):
- `fieldValues` (required, non-empty array) of `{ fieldId, itemId }`

**Response**: Field value deleted successfully (TypeORM delete result)

**Business Logic**: Deletes all listed (`fieldId`, `itemId`) pairs in one statement, then bumps `ufields:{itemId}`, `cfields:{itemId}`, `userfilter` and `userlist:{tenantId}` caches and emits a `FIELD_VALUE` / `DELETED` audit event with the deleted pairs as metadata.

---

### Get Field Options - POST `/options/read`

**API ID**: `api.fieldValues.search` (reused; there is no options-read ID in `APIID`)

**Route**: `POST /user/v1/fields/options/read`

**Authentication**: Not enforced by a guard

**Request Body** (`FieldsOptionsSearchDto`):
- `fieldName` (required) - validated as a SQL identifier
- `controllingfieldfk` (optional string[]) - parent option ids for dependent fields
- `context`, `contextType` (optional) - disambiguate fields sharing a name
- `optionName` (optional) - case-insensitive substring search (`ILIKE`, bound parameter)
- `sort` (optional) - `[column, "asc"|"desc"]`; column validated as a SQL identifier
- `limit` (default 1000), `offset` (default 0)

**Response**: `{ totalCount, fieldId, values: [{ value, label, ... }] }`. `value`/`label` come from the `*_id`/`*_name` columns of table-backed fields.

**Business Logic**: Resolves the field by name/context. Source `table`: queries `public."<table>"` filtered by `is_active=1`, optionally by `"<dependsOn>_id" IN (...)` (bound) and `optionName`; default order is `<fieldName>_name ASC`. Source `jsonFile`: reads the file at `sourceDetails.filePath`. Otherwise uses `fieldParams.options` (filtered by `controllingfieldfk`). Cached for 1 h in `fields:global`.

**Edge Cases**:
- Invalid `fieldName` / `sort[0]` -> 400
- `controllingfieldfk` on a field without `dependsOn` -> 404 `No ControllingFields Found for this Field`
- No options -> 404 `No data found in <fieldName> table`

---

### Delete Field Option - DELETE `/options/delete/:fieldName`

**API ID**: `api.fields.options.delete`

**Route**: `DELETE /user/v1/fields/options/delete/:fieldName`

**Authentication**: Required (`JwtAuthGuard`)

**Path Parameters**:
- `fieldName` (required) - Field name

**Query Parameters**:
- `option` (optional) - Option value to delete
- `context` (optional) - Context filter
- `contextType` (optional) - Context type filter

**Response**: `200` `{ affected }`

**Business Logic**: Resolves a single field (400 if several fields share the name and context/contextType do not narrow it, 404 if none). Source `table`: validates the table identifier and runs `DELETE FROM public.<table> WHERE "value"=$1` (all rows when `option` is omitted). Source `fieldparams`: removes the option from `fieldParams.options`. On success invalidates field definition caches.

---

### Get Form Fields - GET `/formFields`

**API ID**: `FormData` (literal string, not in `APIID`)

**Route**: `GET /user/v1/fields/formFields`

**Authentication**: Not required

**Query Parameters**:
- `context` (optional) - Context filter
- `contextType` (optional) - Context type filter

**Response**: Custom field definitions for the context plus the core fields from `src/utils/corefield.json` (`users` and `cohort` core fields are appended for context `USERS` / `COHORT`; with no context and no contextType both lists are appended to the global fields).

**Business Logic**: Always includes fields with null `context` and `contextType`; adds fields matching `context` (with null contextType) and `contextType`. Cached for 1 h in `fields:global`.

---

## Internal Helpers (used by other modules)

- `getBulkCustomFieldDetails(itemIds, "Users" | "Cohort")` - Per-owner cached hydration of custom field values, resolving table/fieldparams options to `{ id, value, label }` selected values and JSON-parsing `json` fields.
- `filterUserUsingCustomFieldsOptimized(context, { fieldName: value | value[] })` - Returns ids of `USERS`/`COHORT` rows matching all field filters (one JOIN pair per filter, bound parameters, `value && ARRAY[...]` overlap). Returns `null` for other contexts, empty filters or no match. `filterUserUsingCustomFields` is a thin alias.
- `validateCustomField` / `validateCustomFieldByContext` - Validate cohort/user `customFields` payloads: field exists, no duplicate `fieldId`, value passes the `FieldFactory` validator, field belongs to the context (or is global).
- `getFieldValuesData`, `getCustomFieldDetails`, `findCustomFields`, `getFieldIdByLabel`, `updateCustomFields`, `updateUserCustomFields`, `getUserTenantIds`.
- `CustomFieldsValidation.validate(fieldType, value)` (`src/common/utils/custom-field-validation.ts`) - Lightweight checks for `email` (validator.js `isEmail`), `mobile` (exactly 10 characters) and `date` (`YYYY-MM-DD` regex).

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
