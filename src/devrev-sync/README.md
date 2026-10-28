# DevRev sync (user service)

Syncs learners to DevRev: a **Rev User**, a **`learner_profile`** custom object, and one
**`alp_enrollment`** per ALP cohort membership. Each record is linked to the Rev User.
The LMS and assessment services write their own fields and records separately.

Sync is **off** unless `DEVREV_SYNC_ENABLED=true`. When it is off, nothing connects to
Redis, the hooks do nothing, and the admin endpoints answer 409.

## How it works

1. A write path (user create/update, activation, cohort-member create/update/move,
   batch shortlisting, bulk create) calls `DevRevSyncQueue.enqueueLearner(userId)`.
   The call is not awaited and never throws, so a learner's request is never slowed
   or failed by DevRev.
2. The BullMQ queue `devrev-sync-user-service` holds one `learner` job per user.
   Changes within `DEVREV_SYNC_DEBOUNCE_MS` collapse into one job. A change made
   while that learner's job is running schedules exactly one follow-up job.
3. The worker (`LearnerSyncService`) reads the learner's current state and writes:
   Rev User (found by `external_ref` = userId) → `learner_profile` → each ALP
   `alp_enrollment` → Rev User links.
4. Each record is created with a `unique_key`. On a conflict, the worker finds the
   record by `tnt__external_id` (or `tnt__aspire_user_id` for the profile) and
   updates it. The DevRev ID, payload hash and link state are kept in `DevRevSync`,
   so later syncs are a single update, or no call at all when nothing changed.

Only users with the student role are synced, the same rule as the Elasticsearch index.
The service never changes DevRev schemas.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVREV_SYNC_ENABLED` | `false` | Master switch |
| `DEVREV_SYNC_DRY_RUN` | `false` | Log request bodies instead of calling DevRev, with names, emails, gender and date of birth masked. Rows get status `DRY_RUN`; no DevRev IDs are stored |
| `DEVREV_SYNC_LEARNER_PROFILE` | `true` | Switch for `learner_profile` |
| `DEVREV_SYNC_ALP_ENROLLMENT` | `true` | Switch for `alp_enrollment` |
| `DEVREV_SYNC_REV_USERS` | `true` | Switch for Rev Users and links (also needs `DEVREV_REV_ORG_ID`) |
| `DEVREV_BASE_URL` | `https://api.devrev.ai` | Public API only, never `/internal` |
| `DEVREV_API_TOKEN` | — | DevRev token (same name as the other services; `DEVREV_TOKEN` is read as a fallback). Required unless dry-run. Never logged |
| `DEVREV_REV_ORG_ID` | — | The "Aspire Learners" rev org (`don:identity:...`) |
| `DEVREV_LINK_TYPE_PROFILE_ID` | — | Link type "Aspire learner profile" (Rev User → `learner_profile`), e.g. `don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/5` |
| `DEVREV_LINK_TYPE_RECORD_ID` | — | Link type "Aspire learner record" (Rev User → `alp_enrollment`), e.g. `don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/3` |
| `DEVREV_PROFILE_FIELD_MAP` | `{}` | JSON: `learner_profile` field → `Fields.name` prefix or list of prefixes (see below) |
| `DEVREV_ALP_COHORT_TYPES` | empty | Comma-separated `Cohort.type` values that count as ALP. Empty = every cohort |
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
A table created before the `retryable` column was added needs:

```sql
ALTER TABLE public."DevRevSync" ADD COLUMN IF NOT EXISTS "retryable" boolean;
```

## Failures

- 429, 5xx and network errors are retried: twice in place, then by the queue with
  backoff (5s, 10s, 20s, 40s, or DevRev's `Retry-After`).
- Any other 4xx fails at once with no retries: `field_not_in_schema`, an invalid enum
  value, "No tenant fragment found", `unexpected_id_type`. The row is `FAILED` with
  `retryable = false`. Fix the cause, then call `POST /resync`.
- A create conflict (409) is not an error: the record is found and updated.
- `cron/retry-failed` re-queues only `retryable` failures, for up to 3 more rounds
  after the job's own attempts.

## Endpoints (prefix `/user/v1/devrev-sync`)

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /resync` with `{ "userId" }` or `{ "cohortId" }` | JWT | Re-send a learner or a whole cohort in full. Also the backfill entry point |
| `GET /status?cohortId=` | JWT | Counts by record type and status, queue counts, the latest 50 failures |
| `POST /cron/retry-failed` | none, like the other `cron/*` endpoints | Re-queue learners with a retryable `FAILED` record (see Failures). Point the external scheduler at it, e.g. every 15 minutes |

## Not covered yet

- **Deletions and withdrawals by delete:** `deleteUserById`, `deleteCohortMemberById` and
  anonymize don't touch DevRev; records stay as last synced (open question Q7).
- **Stages after enrollment:** `lifecycle_stage` and `latest_alp_status` stop at
  Shortlisted/Withdrawn here. In Progress, Completed, Passed and the Failed stages need
  LMS data (open question Q2).
- **`learner_profile` fields with no owner:** `latest_alp_cohort`, `latest_alp_status`,
  `is_alumni`, `alp_graduation_cohort` and the ELP summary fields are not sent.
  `activation_date` has no source (`Users` stores no activation time).
