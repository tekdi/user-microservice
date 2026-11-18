# Cron Module

## Module Overview

The Cron module manages scheduled tasks and background jobs. It currently contains two jobs: the Navapatham student-to-batch assignment and the Pragyanpath user-to-tenant mapping. Each job can also be triggered manually over HTTP.

**Purpose**: Execute scheduled tasks and background jobs at specified intervals.

**Key Entities**: None of its own (stateless jobs operating on `Cohort`, `CohortMembers`, `CohortAcademicYear`, `UserTenantMapping`, `User`, `Tenant`, `UserRoleMapping`, `AcademicYear`)

**Dependencies**:
- `ScheduleModule` (`@nestjs/schedule`) - Cron scheduling
- `UserModule` - `findAllUserDetails` for eligible user lookup
- `FieldsModule` - `filterUserUsingCustomFieldsOptimized` for district to cohort lookup
- `CohortMembersModule`, `CohortModule`, `UserTenantMappingModule` - Services and repositories
- `KafkaModule` - Publishes cohort member and user-tenant mapping events
- `CacheService` - Invalidates affected namespaces after writes

## Configuration

`src/cron/navapatham.config.ts` holds the Navapatham configuration:

```typescript
export const navapathamConfig = {
  tenantId: "<tenant UUID>",
};
```

The academic year is no longer configured: the job resolves it at run time as the `AcademicYear` row with `isActive = true` for `tenantId`. Pragyanpath uses `SSO_DEFAULTS.DEFAULT_TENANT_ID` and `SSO_DEFAULTS.DEFAULT_LEARNER_ROLE_ID` from `src/constants/sso.constants.ts`.

## API Endpoints

Both endpoints run the job synchronously and return when it finishes. Neither route has a guard decorator in `CronController`.

### Navapatham Assign - POST `/cron/navapatham/assign-students`

**API ID**: `api.cron.navapatham.assign`

**Route**: `POST /user/v1/cron/navapatham/assign-students`

**Schedule**: The `@Cron(EVERY_DAY_AT_MIDNIGHT)` decorator on `assignStudentsToBatches` is commented out, so the job runs only when this endpoint is called.

**Response**: `200` `{ message: "Cron job executed successfully" }`; `500` with the error message on failure.

**Business Logic**:
1. Reads `tenantId` from `navapathamConfig` and finds the active academic year for that tenant.
2. Fetches users via `UserService.findAllUserDetails` with filters `fromDate = today (yyyy-MM-dd)`, `state = ["36"]` (Telangana), `tenantStatus = ["pending"]`, including custom fields.
3. For each user:
   - Remote-only gate: reads the custom field `WHAT_IS_YOUR_PREFERRED_MODE_OF_LEARNING` (fieldId `7b43db0a-f4c3-4c77-919f-622509ca7add`, or label match) and skips the user unless its first selected value (or raw value) equals `remote` (case-insensitive, trimmed).
   - Reads the `district` custom field id (`selectedValues[0].id`); skips if missing or invalid.
   - Finds COHORT ids for that district via `filterUserUsingCustomFieldsOptimized("COHORT", { district })` (cached in the `userfilter` namespace for 5 min).
   - Reads the `block` custom field id; skips if missing or invalid.
   - For each cohort, loads active child `BATCH` cohorts of the tenant (ordered by name) whose `metadata.blockId` equals the user's block id.
   - For each matching batch, looks up its `CohortAcademicYear` for the active year, counts `ACTIVE` members, and if fewer than 100 and the user is not already a member, creates a `CohortMembers` row (`status = active`, `statusReason = "Auto-assigned by Navapatham cron job"`, `createdBy`/`updatedBy` = the user).
   - Updates `UserTenantMapping.status` to `active` for the user and tenant.
   - Invalidates cache namespaces `user:{userId}`, `usertenant:{userId}`, `userlist:{tenantId}`, `cohortmember:{tenantId}`.
   - Publishes a Kafka cohort member `created` event and a user-tenant mapping `updated_status` event. Kafka failures are logged and do not fail the assignment.
4. Logs a summary (`totalUsers`, `assigned`, `skipped`, `errors`).

**Edge Cases**:
- No eligible users -> logs and returns without changes
- User not `remote`, missing/invalid district or block -> counted as skipped
- No cohort/batch for the district/block, or all matching batches full (100 members) -> user skipped
- User already in the batch -> treated as assigned, no new row
- Per-user and per-batch errors are collected and logged; the run continues
- A fatal error is logged and swallowed (the HTTP call still returns `200`)

**Side Effects**: Inserts `CohortMembers`, updates `UserTenantMapping`, cache invalidation, Kafka events.

---

### Pragyanpath Map Users - POST `/cron/pragyanpath/map-users`

**API ID**: `api.cron.pragyanpath.mapUsers`

**Route**: `POST /user/v1/cron/pragyanpath/map-users`

**Schedule**: `mapPrathaUsersToTenant` is decorated with `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` (server time zone), so it runs automatically every day at 00:00 in addition to the manual endpoint.

**Response**: `200` `{ message: "Pragyanpath user mapping cron job executed successfully" }`; `500` on failure.

**Business Logic**:
1. Selects users where `DATE(createdAt)` is today and `email LIKE '%@pratham.org'`.
2. For each user: skips if a `UserTenantMapping` to the default tenant already exists; otherwise creates an `active` mapping, and creates a `UserRoleMapping` with the default learner role if none exists for that tenant.
3. Invalidates `user:{userId}`, `usertenant:{userId}`, `userroles:{userId}`, `userlist:{tenantId}`.
4. Publishes a user-tenant mapping `created` Kafka event (failures logged, not fatal).
5. Logs a summary (`totalUsers`, `mapped`, `skipped`, `errors`).

**Edge Cases**:
- No matching users -> logs and returns
- Already mapped -> skipped
- Per-user errors are collected and logged; the run continues

**Side Effects**: Inserts `UserTenantMapping` and `UserRoleMapping`, cache invalidation, Kafka events.

## Common Issues & Solutions

### Issue: Cron job not running
**Solution**: Only the Pragyanpath job is scheduled. Navapatham must be triggered through its endpoint (or the `@Cron` decorator re-enabled). Check the server time zone for the midnight schedule.

### Issue: Navapatham assigns nobody
**Solution**: Check there is an active `AcademicYear` for `navapathamConfig.tenantId`; users must be created today, in state `36`, with tenant status `pending` and preferred mode of learning `remote`; district cohorts must have active `BATCH` children whose `metadata.blockId` matches the user's block, with a `CohortAcademicYear` for the active year and fewer than 100 active members.

### Issue: Pragyanpath users not mapped
**Solution**: Only users created on the current date with an `@pratham.org` email are considered.

### Common Mistakes to Avoid
1. Not configuring `navapathamConfig.tenantId`
2. Expecting Navapatham to run on a schedule
3. Missing error handling in cron jobs
4. Not logging cron job execution
