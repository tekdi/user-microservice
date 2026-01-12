# Navapatham Student Batch Assignment Cron Job - Comprehensive Documentation

## Table of Contents
1. [Overview](#overview)
2. [Complete Logical Flow](#complete-logical-flow)
3. [Scenarios Where Users Won't Be Added](#scenarios-where-users-wont-be-added)
4. [Major Challenges & Edge Cases](#major-challenges--edge-cases)
5. [Potential Breaking Points](#potential-breaking-points)
6. [Configuration](#configuration)
7. [Manual Testing](#manual-testing)

---

## Overview

**Purpose**: Automatically assign self-registered students from Telangana (state ID: 28) to batches (cohorts) based on their Block ID. The cron job runs daily at midnight (00:00:00).

**Key Requirements**:
- Only processes users created **today** (from midnight)
- Only processes users with **state = 28** (Telangana)
- Only processes users with **tenantStatus = 'pending'**
- Assigns users to batches with matching blockId in metadata
- Batch capacity: **100 active members** per batch
- Updates UserTenantMapping status from 'pending' to 'active' after assignment

---

## Complete Logical Flow

### Step 1: Configuration & Initialization
```
1. Read configuration from navapatham.config.ts:
   - tenantId: Target tenant UUID
   - academicYearId: Academic year UUID
   - systemUserId: System user UUID (for createdBy/updatedBy)

2. Validate configuration exists
   → If missing: Log error and exit

3. Get today's date (YYYY-MM-DD format)
   → Example: "2026-01-12"
```

### Step 2: Fetch Eligible Users
```
Query: findAllUserDetails() with filters:
- fromDate: todayDate (users created today)
- state: ["28"] (Telangana)
- tenantStatus: ["pending"]
- includeCustomFields: true (to get blockId)

Result: Array of users with customFields populated
```

### Step 3: Process Each User

#### 3.1 Extract User's BlockId
```
From user.customFields:
- Find field where label/name = "block" (case-insensitive)
- Extract blockId from:
  → selectedValues[0].id (if object: {id: 881, value: "Elamanchili"})
  → selectedValues[0].value (if object has value property)
  → selectedValues[0] (if primitive value)
  → blockField.value (fallback)

Convert to string and trim: blockIdStr
```

#### 3.2 Find Cohorts by BlockId
```
Query: filterUserUsingCustomFieldsOptimized("COHORT", {block: blockIdStr})
- Searches FieldValues table for cohorts
- Matches where custom field 'block' = user's blockId
- Returns array of cohort IDs

If no cohorts found → Skip user
```

#### 3.3 Process Each Cohort
```
For each cohortId:
  1. Find batches (child cohorts):
     Query: Cohort where
     - parentId = cohortId
     - type = "BATCH"
     - status = "active"
     - tenantId = configTenantId
     Order by: name ASC

  2. Filter batches by metadata:
     For each batch:
       - Check if batch.metadata exists
       - Parse metadata (object or JSON string)
       - Extract blockId from metadata
       - Compare: batchBlockId === userBlockId
       → Keep only matching batches

  3. Find available batch:
     For each matching batch:
       a. Get CohortAcademicYear:
          Query: CohortAcademicYear where
          - cohortId = batch.cohortId
          - academicYearId = configAcademicYearId
       
       b. Count active members:
          Query: COUNT CohortMembers where
          - cohortId = batch.cohortId
          - cohortAcademicYearId = cohortAcademicYearId
          - status = "active"
       
       c. Check capacity:
          If memberCount < 100:
            - Check if user already assigned
            - If not assigned:
              → Create CohortMember
              → Update UserTenantMapping status to 'active'
              → Publish Kafka events
              → Mark as assigned, break loop
          Else:
            → Try next batch
```

### Step 4: Summary & Logging
```
Log final summary:
- totalUsers: Total eligible users found
- assigned: Successfully assigned users
- skipped: Users that couldn't be assigned
- errors: Number of errors encountered
```

---

## Scenarios Where Users Won't Be Added

### 1. **Configuration Issues**
- ❌ Missing `tenantId` in navapatham.config.ts
- ❌ Missing `academicYearId` in navapatham.config.ts
- ❌ Missing `systemUserId` in navapatham.config.ts
- **Result**: Cron job exits immediately, no users processed

### 2. **User Filtering Issues**
- ❌ User created **before today** (not in today's date range)
- ❌ User's state is **not 28** (Telangana)
- ❌ User's `tenantStatus` is **not 'pending'`
- **Result**: User not fetched in initial query

### 3. **Block Field Issues**
- ❌ User doesn't have **'block' field** in customFields
- ❌ User's block field has **empty/null value**
- ❌ Block field format is unexpected (can't extract blockId)
- **Result**: User skipped, logged as "no_block_field" or "empty_blockId"

### 4. **Cohort Matching Issues**
- ❌ **No cohorts found** with matching blockId in FieldValues
- ❌ Cohort exists but **custom field 'block' doesn't match** user's blockId
- ❌ Field name mismatch (e.g., field named "Block" vs "block" - case sensitivity)
- **Result**: User skipped, logged as "no_cohorts_found"

### 5. **Batch Issues**
- ❌ Cohort has **no batches** (no child cohorts with type='BATCH')
- ❌ All batches have **status != 'active'**
- ❌ Batches belong to **different tenant**
- **Result**: Continue to next cohort

### 6. **Metadata Matching Issues**
- ❌ Batch has **no metadata** field
- ❌ Batch metadata **doesn't contain blockId**
- ❌ Batch metadata blockId **doesn't match** user's blockId
- ❌ Metadata format is invalid (can't parse)
- **Result**: Batch filtered out, try next batch

### 7. **Academic Year Issues**
- ❌ Batch has **no CohortAcademicYear** mapping for the configured academic year
- ❌ Academic year is **not active** or doesn't exist
- **Result**: Skip batch, try next batch

### 8. **Capacity Issues**
- ❌ All batches are **full** (memberCount >= 100)
- ❌ Batch has exactly 100 active members
- **Result**: Try next batch, if all full → user skipped

### 9. **Duplicate Assignment**
- ❌ User is **already assigned** to the batch
- **Result**: Mark as assigned (already done), skip creation

### 10. **Database/System Errors**
- ❌ Database connection failure
- ❌ Transaction errors during save
- ❌ Kafka event publishing failure (non-blocking)
- **Result**: Error logged, user skipped, continue processing

---

## Major Challenges & Edge Cases

### 1. **BlockId Format Variations**
**Challenge**: BlockId can be stored in multiple formats:
- As object: `{id: 881, value: "Elamanchili"}`
- As string: `"881"`
- As number: `881`
- In metadata: JSON string `"{\"blockId\": \"881\"}"` or object `{blockId: "881"}`

**Solution**: Handle all formats with fallback logic:
```typescript
// User blockId extraction
const userBlockId = firstValue?.id || firstValue?.value || firstValue || blockField.value;
const blockIdStr = String(userBlockId).trim();

// Batch metadata parsing
if (typeof batch.metadata === 'object') {
  metadataObj = batch.metadata;
} else {
  metadataObj = JSON.parse(String(batch.metadata));
}
```

### 2. **Metadata Parsing**
**Challenge**: Metadata can be:
- Object: `{blockId: "881"}`
- JSON string: `'{"blockId": "881"}'`
- Plain string: `"blockId: 881"` or `"blockId=881"`

**Solution**: Try multiple parsing strategies:
1. Use directly if object
2. Parse as JSON if string
3. Use regex pattern matching as fallback

### 3. **Case Sensitivity**
**Challenge**: Field names might be case-sensitive:
- Field name: "block" vs "Block" vs "BLOCK"
- Label: "block" vs "Block"

**Solution**: Use case-insensitive comparison:
```typescript
field.label?.toLowerCase() === "block" || field.name?.toLowerCase() === "block"
```

### 4. **Multiple Cohorts per Block**
**Challenge**: One blockId can have multiple cohorts
- Each cohort can have multiple batches
- Need to try all combinations

**Solution**: Nested loops:
- For each cohort → For each batch → Check capacity

### 5. **Race Conditions**
**Challenge**: Multiple users processed simultaneously might:
- Count same batch members at same time
- Both see capacity < 100
- Both try to assign → might exceed 100

**Solution**: Database constraints + check before save (current implementation checks, but not atomic)

### 6. **Date Timezone Issues**
**Challenge**: "Today" depends on server timezone
- Server in UTC vs IST
- Midnight in UTC ≠ Midnight in IST

**Solution**: Uses server's local timezone via `format(new Date(), "yyyy-MM-dd")`

### 7. **FieldValues Query Performance**
**Challenge**: `filterUserUsingCustomFieldsOptimized` might be slow for:
- Large number of cohorts
- Large number of field values
- Complex joins

**Solution**: Uses optimized query with EXISTS clauses

---

## Potential Breaking Points

### 🔴 **Critical Issues (Will Break Entire Job)**

1. **Configuration Missing**
   - Missing tenantId/academicYearId/systemUserId
   - **Impact**: Job exits immediately
   - **Fix**: Ensure navapatham.config.ts has all values

2. **Database Connection Failure**
   - Database down or connection lost
   - **Impact**: All operations fail
   - **Fix**: Ensure database is accessible, connection pool configured

3. **Service Injection Failures**
   - UserService, FieldsService, etc. not available
   - **Impact**: Job crashes on startup
   - **Fix**: Ensure all modules are properly imported in CronModule

### 🟡 **Major Issues (Will Skip Users)**

4. **Field Name Mismatch**
   - Custom field not named exactly "block" (case-insensitive)
   - **Impact**: All users skipped (no block field found)
   - **Fix**: Ensure field name/label is "block"

5. **State ID Mismatch**
   - State ID not exactly "28" in database
   - **Impact**: No users fetched
   - **Fix**: Verify state ID in FieldValues matches "28"

6. **Date Format Issues**
   - Server timezone different from expected
   - **Impact**: Wrong date range, no users found
   - **Fix**: Ensure server timezone is correct

7. **Cohort-Batch Relationship Broken**
   - Batches don't have correct parentId pointing to cohort
   - **Impact**: No batches found for cohorts
   - **Fix**: Ensure batch.parentId = cohort.cohortId

8. **Metadata Format Incompatible**
   - Metadata stored in unexpected format
   - **Impact**: Batches not matched, users skipped
   - **Fix**: Ensure metadata is JSON or parseable string

### 🟠 **Moderate Issues (Will Skip Some Users)**

9. **Academic Year Not Linked**
   - Batch not linked to academic year via CohortAcademicYear
   - **Impact**: Batch skipped for that user
   - **Fix**: Ensure CohortAcademicYear entries exist

10. **All Batches Full**
    - All batches have 100+ active members
    - **Impact**: User cannot be assigned
    - **Fix**: Create new batches or increase capacity

11. **Kafka Service Failure**
    - Kafka events fail to publish
    - **Impact**: Assignment succeeds but events not published (non-blocking)
    - **Fix**: Check Kafka configuration, service continues

12. **Duplicate Assignment Check**
    - User already assigned but check fails
    - **Impact**: Duplicate CohortMember created (if no DB constraint)
    - **Fix**: Database unique constraint recommended

### 🟢 **Minor Issues (Edge Cases)**

13. **BlockId Type Mismatch**
    - User blockId: number 881 vs Batch metadata: string "881"
    - **Impact**: Comparison fails
    - **Fix**: Code handles this with String() conversion

14. **Whitespace in BlockId**
    - BlockId: " 881 " vs "881"
    - **Impact**: Comparison fails
    - **Fix**: Code handles this with .trim()

15. **Metadata Key Variations**
    - Metadata uses "block_id" instead of "blockId"
    - **Impact**: BlockId not extracted
    - **Fix**: Code checks both: `metadataObj.blockId || metadataObj.block_id`

16. **Empty Arrays**
    - selectedValues is empty array []
    - **Impact**: BlockId not extracted
    - **Fix**: Falls back to blockField.value

---

## Configuration

### File: `src/cron/navapatham.config.ts`
```typescript
export const navapathamConfig = {
  tenantId: 'ef99949b-7f3a-4a5f-806a-e67e683e38f3',
  academicYearId: '9a9e0daa-50dd-4d0e-8d10-36e7bc808f88',
  systemUserId: '9a9e0daa-50dd-4d0e-8d10-36e7bc808f88',
};
```

**Required Values**:
- `tenantId`: UUID of the tenant to process
- `academicYearId`: UUID of the academic year
- `systemUserId`: UUID for createdBy/updatedBy fields

---

## Manual Testing

### Endpoint
```
POST /user/v1/cron/navapatham/assign-students
```

### Curl Command
```bash
curl -X POST http://localhost:3000/user/v1/cron/navapatham/assign-students \
  -H "Content-Type: application/json"
```

### Expected Response
```json
{
  "statusCode": 200,
  "message": "Cron job completed",
  "data": {
    "message": "Cron job executed successfully"
  }
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CRON JOB TRIGGERED                        │
│                  (Daily at Midnight)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Load Configuration                                  │
│  - tenantId, academicYearId, systemUserId                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Fetch Eligible Users                               │
│  Filters:                                                   │
│  - createdAt >= today (midnight)                            │
│  - state = 28 (Telangana)                                  │
│  - tenantStatus = 'pending'                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: For Each User                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3.1 Extract blockId from customFields                │   │
│  │     - Find 'block' field                            │   │
│  │     - Extract id/value                              │   │
│  └──────────────────────┬─────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 3.2 Find Cohorts by blockId                          │ │
│  │     - Query FieldValues for COHORT context           │ │
│  │     - Match where block = userBlockId               │ │
│  └──────────────────────┬─────────────────────────────┘ │
│                          │                                │
│                          ▼                                │
│  ┌──────────────────────────────────────────────────────┐│
│  │ 3.3 For Each Cohort                                  ││
│  │  ┌──────────────────────────────────────────────┐   ││
│  │  │ 3.4 Find Batches                              │   ││
│  │  │    - parentId = cohortId                      │   ││
│  │  │    - type = 'BATCH'                           │   ││
│  │  │    - status = 'active'                        │   ││
│  │  └──────────────┬─────────────────────────────────┘ ││
│  │                 │                                     ││
│  │                 ▼                                     ││
│  │  ┌──────────────────────────────────────────────┐   ││
│  │  │ 3.5 Filter Batches by Metadata                │   ││
│  │  │    - Parse metadata (object/JSON/string)      │   ││
│  │  │    - Extract batchBlockId                     │   ││
│  │  │    - Compare: batchBlockId === userBlockId    │   ││
│  │  └──────────────┬─────────────────────────────────┘ ││
│  │                 │                                     ││
│  │                 ▼                                     ││
│  │  ┌──────────────────────────────────────────────┐   ││
│  │  │ 3.6 For Each Matching Batch                   │   ││
│  │  │  ┌────────────────────────────────────────┐  │   ││
│  │  │  │ Get CohortAcademicYear                 │  │   ││
│  │  │  └──────────┬─────────────────────────────┘  │   ││
│  │  │             │                                  │   ││
│  │  │             ▼                                  │   ││
│  │  │  ┌────────────────────────────────────────┐ │   ││
│  │  │  │ Count Active Members                   │ │   ││
│  │  │  │ - If count < 100:                      │ │   ││
│  │  │  │   → Create CohortMember                 │ │   ││
│  │  │  │   → Update UserTenantMapping            │ │   ││
│  │  │  │   → Publish Kafka Events                │ │   ││
│  │  │  │   → BREAK (assigned = true)             │ │   ││
│  │  │  │ - Else: Try next batch                   │ │   ││
│  │  │  └────────────────────────────────────────┘ │   ││
│  │  └──────────────────────────────────────────────┘   ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Log Summary                                        │
│  - Total users processed                                     │
│  - Assigned count                                            │
│  - Skipped count                                             │
│  - Errors count                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Validation Points

### Before Assignment:
1. ✅ User has block field in customFields
2. ✅ BlockId is not empty
3. ✅ Cohorts exist for this blockId
4. ✅ Batches exist for cohorts
5. ✅ Batch metadata contains matching blockId
6. ✅ CohortAcademicYear exists
7. ✅ Batch has capacity (< 100 members)
8. ✅ User not already assigned

### After Assignment:
1. ✅ CohortMember created successfully
2. ✅ UserTenantMapping status updated to 'active'
3. ✅ Kafka events published (non-blocking)

---

## Recommendations

### 1. **Add Database Constraints**
- Add unique constraint on (userId, cohortId, cohortAcademicYearId) in CohortMembers
- Prevents duplicate assignments

### 2. **Add Transaction Support**
- Wrap assignment in transaction
- Ensures atomicity: either both CohortMember and UserTenantMapping update, or neither

### 3. **Add Retry Logic**
- For transient errors (DB connection, etc.)
- Retry failed assignments

### 4. **Add Monitoring**
- Track assignment success rate
- Alert if too many users skipped
- Monitor batch capacity utilization

### 5. **Add Idempotency**
- Check if user already processed today
- Skip if already processed

### 6. **Performance Optimization**
- Batch process users in chunks
- Use database transactions for bulk operations
- Cache cohort-batch mappings

---

## Troubleshooting Guide

### Issue: No users found
**Check**:
- Date filter: Are users created today?
- State filter: Is state ID exactly "28"?
- TenantStatus: Is it exactly "pending"?
- TenantId: Does it match the configured tenant?

### Issue: Users found but not assigned
**Check**:
- Does user have 'block' field in customFields?
- Is blockId value populated?
- Do cohorts exist with matching blockId?
- Do batches exist for those cohorts?
- Does batch metadata contain matching blockId?
- Is batch linked to academic year?
- Is batch capacity < 100?

### Issue: Batch not matched
**Check**:
- Batch metadata format (object vs string)
- Metadata key name (blockId vs block_id)
- BlockId value format (string vs number)
- Whitespace in blockId values

### Issue: Assignment fails
**Check**:
- Database connection
- CohortAcademicYear exists
- User not already assigned
- System user ID is valid
- Kafka service (non-blocking, won't fail assignment)

---

## Log Messages Reference

### Success Messages:
- `"Navapatham cron job started"`
- `"Found X eligible users"`
- `"Found X cohort(s) for user..."`
- `"Assigned user X to batch Y (Z/100)"`
- `"Cron job completed. Assigned: X, Skipped: Y, Errors: Z"`

### Warning Messages:
- `"User X does not have block field in customFields"`
- `"User X has empty blockId"`
- `"No cohorts found for user X with blockId Y"`
- `"No CohortAcademicYear found for batch X"`
- `"User X is already assigned to batch Y"`
- `"Batch X is full (Y/100), trying next batch"`
- `"Could not assign user X - no available batch found"`

### Error Messages:
- `"Missing required configuration: ..."`
- `"Error processing batch X for user Y: ..."`
- `"Error processing user X: ..."`
- `"Fatal error in cron job: ..."`

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-12  
**Maintained By**: Development Team
