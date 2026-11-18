# Automatic Member Module

## Module Overview

The Automatic Member module handles automatic assignment of users to cohorts based on custom field values. A rule (`AutomaticMember` row) ties a user, in a tenant, to the cohorts whose custom field matches the rule condition. Instead of creating `CohortMembers` rows, the Cohort module resolves the user's cohorts from the active rule when `GET /cohort/mycohorts/:userId` is called.

**Purpose**: Automatically assign users to cohorts based on custom field criteria without manual intervention.

**Key Entities**:
- `AutomaticMember` - Stores automatic member assignment rules (table `AutomaticMember`)

**Dependencies**:
- `User` repository - Used by `create` to look up the user
- `UserModule` - Creates/activates/deactivates rules from the user update API
- `CohortModule` - Resolves rule-based cohorts for `mycohorts`
- `FieldsModule` - For custom field evaluation (`getSearchFieldValueData`)

## Database Schema

### AutomaticMember Entity (`AutomaticMember`)
- `id` (UUID, Primary Key, Auto-generated)
- `userId` (UUID)
- `tenantId` (UUID)
- `rules` (JSONB) - `{ condition: { fieldId, value, operator? }, cohortField, allowedActions?: { user: string[], cohort: string[] } }`
- `isActive` (Boolean, default `true`) - Only one active rule per user and tenant is kept active by the user update flow
- `createdAt` (Timestamp)

## API Endpoints

Controller path: `automaticMember` (`/user/v1/automaticMember`). The controller has no `JwtAuthGuard`, no API ids and no response wrapper; it returns the raw entity or a Nest exception.

### Create - POST `/`

**Request Body** (`CreateAutomaticMemberDto`, `ValidationPipe`):
- `userId` (UUID), `tenantId` (UUID), `isActive` (boolean)
- `rules`: `condition` (`value` string, `fieldId` UUID, optional `operator`), `cohortField` (string), optional `allowedActions` (`user[]`, `cohort[]`)

**Business Logic**: Checks whether an active rule already exists for the user, tenant and the first element of `rules.condition.value` (SQL match against the JSON `condition.value` array); if so the request is rejected. Otherwise saves the rule.

**Edge Cases**:
- Every error raised inside the method (including the duplicate-rule check) is returned as 500 `Failed to create automatic member.`

### List - GET `/`
Returns all rules (all tenants, all statuses).

### Get One - GET `/:id`
Returns the rule plus `status: "Active" | "Inactive"`. Not found → 404 (`AutomaticMember with ID {id} not found`).

### Update - PATCH `/:id`
Body is `UpdateAutomaticMemberDto` (all create fields optional). Merges the body onto the rule and saves. Not found → 404.

### Delete - DELETE `/:id`
Hard-deletes the rule. Returns `{ message: "AutomaticMember deleted successfully" }`. Not found → 404.

### Internal service methods
- `checkMemberById(userId)` - active rule for a user (used by `mycohorts`); returns `false` when none
- `checkAutomaticMemberExists(userId, tenantId, assignTo)` - rules whose `condition.value` array contains `assignTo`
- `getUserbyUserIdAndTenantId(userId, tenantId, isActive)` - rule by status

## How Rules Are Created and Used

**Creation (user update API)**: `PATCH /user/update/:userid` with `automaticMember: { value: true, fieldId, fieldName }` and the matching entry in `customFields`:
1. The custom field value (an array) is taken as the assignment target
2. If an active rule already exists for that user, tenant and value → 400 (`User already assign to that {fieldName}`)
3. If an inactive rule exists for that value, the currently active rule is deactivated and the old one is re-activated
4. Otherwise the current active rule is deactivated and a new rule is created with `condition = { value: <field value array>, fieldId }` and `cohortField = fieldName`

**Usage (`GET /cohort/mycohorts/:userId`)**:
1. `checkMemberById` finds an active rule for the user
2. The Cohort module looks up field values matching `condition.fieldId` / `condition.value` and keeps the cohort ids (`itemId`)
3. Those cohorts are filtered to the requested academic year through `CohortAcademicYear`
4. If no cohort matches the rule the request fails with `No Cohort IDs found for the given fieldId and value.` (surfaced as 500)

## Common Issues & Solutions

### Issue: Users not automatically assigned to cohorts
**Solution**: Verify the rule is active (`isActive = true`), `condition.fieldId` is the cohort custom field and `condition.value` matches the stored cohort field value. Check the cohort is mapped to the requested academic year.

### Issue: Wrong cohorts after changing the assignment
**Solution**: Updating the user with a new automatic member value deactivates the previous active rule and creates (or re-activates) another; only one rule stays active per user and tenant.

### Common Mistakes to Avoid
1. Not providing correct field values for evaluation
2. Missing automatic member configuration (`automaticMember.fieldId` must match a custom field sent in the same request)
3. Sending `condition.value` as a plain string to the HTTP create API: the duplicate check reads `value[0]`, and the user update flow stores an array
