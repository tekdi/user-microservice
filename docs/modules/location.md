# Location Module

## Module Overview

The Location module manages geographical location records (state, district, block, village) in the `location` table. It exposes a small CRUD and search API. Note that hierarchical location filtering in the User module reads state/district/block/village from custom fields, not from this table.

**Purpose**: Manage location hierarchies for geographical filtering and user organization.

**Key Entities**:
- `Location` (table `location`): `id` (varchar, primary key, not auto-generated), `code`, `name`, `parentid`, `type`

**Dependencies**: None (standalone module; uses TypeORM `Location` repository)

## API Endpoints

All routes are under `/user/v1/locations`. None has a guard, and no `ValidationPipe` is attached to the controller (the global pipe is disabled in `main.ts`), so DTO decorators are not enforced here. Responses use `APIResponse` with the API IDs below.

### Create Location - POST `/`

**API ID**: `api.create.location`

**Request Body** (`CreateLocationDto`): `code`, `name`, `type` (required), `parentid` (optional)

**Response**: `200` Location created successfully (saved entity). `500` on error.

### Get Location - GET `/:id`

**API ID**: `api.find.location`

**Response**: `200` array of locations matching `id` (`Location found successfully`). `500` on error.

### Update Location - PATCH `/update/:id`

**API ID**: `api.update.location`

**Request Body**: Any `Location` columns

**Response**: `200` Location updated successfully. `500` on error.

### Delete Location - DELETE `/delete/:id`

**API ID**: `api.delete.location`

**Response**: `200` Location deleted successfully. `500` on error.

### Search Locations - POST `/search`

**API ID**: `api.filter.location`

**Request Body**: `{ filters: { <column>: value, ... }, limit, offset }`

**Business Logic**: With empty `filters`, returns a page of all locations. Otherwise adds an equality condition for each non-empty filter key (`location.<key> = :<key>`) and applies `limit`/`offset`.

**Response**: `200` array of locations. `500` on error.

## Common Issues & Solutions

### Issue: Location-based filters not working
**Solution**: Verify location data exists and matches the filter criteria. Check hierarchical relationships (`parentid`).

### Common Mistakes to Avoid
1. Not validating location hierarchy relationships
2. Missing location data in database
3. Sending `/search` without a `filters` object
