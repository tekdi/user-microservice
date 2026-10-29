# DevRev sync (user service)

Syncs learners to DevRev: a **Rev User**, a **`learner_profile`** custom object, one
**`alp_enrollment`** per ALP cohort membership and one **`elp_pathway`** per pathway the
learner has activated. Each record is linked to the Rev User.
The LMS and assessment services write their own fields and records separately.

Sync is **off** unless `DEVREV_SYNC_ENABLED=true`. When it is off, nothing connects to
Redis, the hooks do nothing, and the admin endpoints answer 409.

## How it works

1. A write path (user create/update, activation, cohort-member create/update/move,
   batch shortlisting, bulk create, pathway assign/switch, volunteer assign, pathway
   completion and status change) calls `DevRevSyncQueue.enqueueLearner(userId)`.
   The call is not awaited and never throws, so a learner's request is never slowed
   or failed by DevRev.
2. The BullMQ queue `devrev-sync-user-service` holds one `learner` job per user.
   Changes within `DEVREV_SYNC_DEBOUNCE_MS` collapse into one job. A change made
   while that learner's job is running schedules exactly one follow-up job.
3. The worker (`LearnerSyncService`) reads the learner's current state and writes:
   Rev User (found by `external_ref` = userId) → `learner_profile` → each ALP
   `alp_enrollment` → each `elp_pathway` → Rev User links.
4. Each record is created with a `unique_key`. On a conflict, the worker finds the
   record by `tnt__external_id` (or `tnt__aspire_user_id` for the profile) and
   updates it. The DevRev ID, payload hash and link state are kept in `DevRevSync`,
   so later syncs are a single update, or no call at all when nothing changed.

Only users with the student role are synced, the same rule as the Elasticsearch index.

**Enrollments.** Every membership of a top-level cohort is an ALP enrollment:
`Cohort.type` and `programId` don't tell ALP from ELP, and ELP is pathways, not cohorts.
Keys use the cohort name, as the seed script and the LMS and assessment services do
(`ALPE:{userId}:{cohortName}`, built only in `enrollmentKeys`); the name also goes in the
`cohort` field. Names are not unique, so when a learner is in two cohorts with the same name
only the newer membership is sent (a warning names the other cohort ID). Renaming a cohort
starts a new DevRev record. `CohortMembers.status` maps as:

| Status | `application_status` | `is_enrolled` | `lifecycle_stage` |
| --- | --- | --- | --- |
| applied, submitted | Pending | false | Applied |
| shortlisted, active | Shortlisted | true | Shortlisted |
| rejected | Rejected | false | Rejected |
| dropout | Shortlisted | false | Withdrawn (`withdrawal_date` = `updatedAt`) |
| inactive, archived | not sent | not sent | not sent |

Stages after enrollment come from the LMS.

**Pathways.** Key `ELPP:{userId}:{pathways.key}` (built only in `pathwayKeys`), from the
learner's current `user_pathways` row for that pathway, else the most recent one. Both
STANDARD and VOLUNTEER pathways sync. Status: ACTIVE → Active, COMPLETED → Completed,
INACTIVE and WITHDRAWN → Inactive (DevRev has no Withdrawn value for pathways).
`is_current` is true only for an ACTIVE row with `is_active`. The LMS sends `progress`
and `last_activity_at`. While `DEVREV_SYNC_COHORT_ALLOWLIST` is set, learners outside the
allowed cohorts are skipped entirely, pathways included.
The service never changes DevRev schemas.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVREV_SYNC_ENABLED` | `false` | Master switch |
| `DEVREV_SYNC_DRY_RUN` | `false` | Log request bodies instead of calling DevRev, with names, emails, gender and date of birth masked. Rows get status `DRY_RUN`; no DevRev IDs are stored |
| `DEVREV_SYNC_LEARNER_PROFILE` | `true` | Switch for `learner_profile` |
| `DEVREV_SYNC_ALP_ENROLLMENT` | `true` | Switch for `alp_enrollment` |
| `DEVREV_SYNC_ELP_PATHWAY` | `true` | Switch for `elp_pathway` |
| `DEVREV_SYNC_REV_USERS` | `true` | Switch for Rev Users and links (also needs `DEVREV_REV_ORG_ID`) |
| `DEVREV_BASE_URL` | `https://api.devrev.ai` | Public API only, never `/internal` |
| `DEVREV_API_TOKEN` | — | DevRev token (same name as the other services; `DEVREV_TOKEN` is read as a fallback). Required unless dry-run. Never logged |
| `DEVREV_REV_ORG_ID` | — | The "Aspire Learners" rev org (`don:identity:...`) |
| `DEVREV_LINK_TYPE_PROFILE_ID` | — | Link type "Aspire learner profile" (Rev User → `learner_profile`), e.g. `don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/5` |
| `DEVREV_LINK_TYPE_RECORD_ID` | — | Link type "Aspire learner record" (Rev User → `alp_enrollment`, `elp_pathway`), e.g. `don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/3` |
| `DEVREV_PROFILE_FIELD_MAP` | `{}` | JSON: `learner_profile` field → `Fields.name` prefix or list of prefixes (see below) |
| `DEVREV_SYNC_COHORT_ALLOWLIST` | empty | Comma-separated cohort IDs, for a phased rollout. Empty = all |
| `DEVREV_SYNC_CONCURRENCY` | `2` | Worker concurrency (never two jobs for the same learner at once) |
| `DEVREV_SYNC_RATE_PER_SEC` | `5` | Jobs per second. DevRev's limit is shared with the LMS and assessment services |
| `DEVREV_SYNC_MAX_ATTEMPTS` | `5` | Job attempts; backoff 5s, 10s, 20s, 40s, or DevRev's `Retry-After` |
| `DEVREV_SYNC_DEBOUNCE_MS` | `30000` | Delay that collapses bursts of changes |
| `DEVREV_SYNC_TIMEOUT_MS` | `15000` | Per-request timeout |

**Profile custom fields.** Each cohort's application form has its own copy of a field,
and some field names carry the help text, so fields are matched by **name prefix**,
ignoring case and punctuation, never by `fieldId`. Allowed targets: `university`,
`study_major`, `education_level`, `first_generation`, `limited_income`. The newest
non-empty answer across the user and all their memberships wins. A yes/no answer that
can't be read is left out and logged by field name only. QA example:

```
DEVREV_PROFILE_FIELD_MAP={"university":["nameOfYourCurrentOrMostRecentUniversity"],"study_major":["fieldOfStudy"],"education_level":["whatStageOfYourUniversityEducationAreYouCurrentlyIn"],"first_generation":["iAmFirstGenerationToGoToUniversity","iAmTheFirstGenerationToGoToUniversity"],"limited_income":["iComeFromALimitedIncomeBackground"]}
```

Both link type IDs are checked at startup: each must be a `custom_link_type/<n>` ID
(a `tenant_fragment/...` schema ID causes `unexpected_id_type`), the two must differ, and
`custom_link_type/4` (a deprecated duplicate) is refused. An invalid ID is logged as an
error and those links are skipped until it is fixed; nothing else stops.

Redis comes from the existing `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` and `REDIS_DB`.

**Staging example:**

```
DEVREV_SYNC_ENABLED=true
DEVREV_SYNC_DRY_RUN=true
DEVREV_SYNC_COHORT_ALLOWLIST=<one test cohort id>
```

## Database

`synchronize` is off, so create the table by hand before enabling sync. The DDL is in
the doc comment of [entities/devrev-sync.entity.ts](entities/devrev-sync.entity.ts).

## Failures

- 429, 5xx and network errors are retried: twice in place, then by the queue with
  backoff (5s, 10s, 20s, 40s, or DevRev's `Retry-After`).
- Any other 4xx fails at once with no retries: `field_not_in_schema`, an invalid enum
  value, "No tenant fragment found", `unexpected_id_type`. The row is `REJECTED`.
  Fix the cause, then call `POST /resync`.
- A create conflict (409) is not an error: the record is found and updated.
- `cron/retry-failed` re-queues only `FAILED` records (never `REJECTED`), for up to 3
  more rounds after the job's own attempts.

## Endpoints (prefix `/user/v1/devrev-sync`)

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /resync` with `{ "userId" }` or `{ "cohortId" }` | JWT | Re-send a learner or a whole cohort in full, ignoring the "unchanged" check. Use after fixing a schema or data problem |
| `POST /backfill` with `{ "cohortId", "dryRun"? }` | JWT | Queue every learner in a cohort. Payload hashes are kept, so a repeat only sends what changed. `dryRun: true` only counts. Run cohort by cohort, oldest first |
| `GET /status?cohortId=` | JWT | Counts by record type and status, queue counts, the latest 50 `FAILED` or `REJECTED` records |
| `POST /cron/retry-failed` | none, like the other `cron/*` endpoints | Re-queue learners with a `FAILED` record (see Failures). Point the external scheduler at it, e.g. every 15 minutes |

## Not covered yet

- **Deletions and withdrawals by delete:** `deleteUserById`, `deleteCohortMemberById` and
  anonymize don't touch DevRev; records stay as last synced (open question Q7).
- **Clearing a field:** empty values are never sent, so a value that becomes empty
  (e.g. `withdrawal_date` after a dropout is reversed) stays in DevRev. Whether
  `custom-objects.update` clears a field sent as `null` is unverified.
- **`withdrawal_date` drift:** `CohortMembers` has no status history, so any later edit
  to a dropout's membership moves the date.
- **`learner_profile` fields with no owner:** `latest_alp_cohort`, `latest_alp_status`,
  `is_alumni`, `alp_graduation_cohort` and the ELP summary fields are not sent.
  `activation_date` has no source (`Users` stores no activation time).
