# Kafka Module

## Module Overview

The Kafka module (`src/kafka`) is a producer-only wrapper around `kafkajs`. Business modules call typed `publish*Event` helpers after a database write; the service wraps the payload in an envelope and sends it to one topic, keyed by the entity ID. There are no consumers in this service.

**Purpose**: Notify downstream services of user, user-tenant, cohort, cohort-member and cohort-academic-year changes.

**Key Entities**: `FieldValues` (read, to resolve `TYPE_OF_CENTER` for batch events).

**Dependencies**: `kafkajs`, `ConfigService`, `FieldValues` repository.

**Exports**: `KafkaService` (module `KafkaModule`).

## Configuration

| Setting | Source | Default |
|---|---|---|
| `KAFKA_ENABLED` | loaded by `kafka.config.ts` as `kafkaEnabled` (must equal `"true"`) | disabled |
| `KAFKA_BROKERS` | read directly, comma-separated | `localhost:9092` |
| `KAFKA_CLIENT_ID` | read directly | `user-service` |
| `KAFKA_TOPIC` | read directly | `user-topic` |

When disabled, every `publish*` method logs a warning and returns; callers need no guard. When enabled, the producer and admin client connect on module init (failure is logged, not thrown), topics are auto-created on first use (tracked in memory), and the client retries up to 8 times.

## Event Envelope

All events go to the single `KAFKA_TOPIC`, JSON-encoded, key = entity ID:

```json
{ "eventType": "USER_CREATED", "timestamp": "<ISO>", "userId": "<id>", "data": { } }
```

The ID property name differs by entity: `userId`, `cohortId`, `cohortMembershipId`, `cohortAcademicYearId`.

## Events

| eventType | Helper | Published from |
|---|---|---|
| `USER_CREATED` | `publishUserEvent('created')` | `user.service` create, `sso.service` new user |
| `USER_UPDATED` | `publishUserEvent('updated')` | `user.service` update, `cohortMembers.service` bulk member update, `sso.service` existing user |
| `USER_DELETED` | `publishUserEvent('deleted')` | `user.service` delete (data: `{ userId, deletedAt }`) |
| `USER_LOGIN` | `publishUserEvent('login')` | `auth.service` `GET /auth` (data: `{ userId, lastLogin }`) |
| `USER_TENANT_MAPPING` | `publishUserTenantEvent('created')` | `userTenantMapping.service`, `cron.service` (Pragyan path) |
| `USER_TENANT_STATUS_UPDATE` | `publishUserTenantEvent('updated_status')` | `userTenantMapping.service`, `cron.service` |
| `USER_TENANT_DELETED` | `publishUserTenantEvent('deleted')` | defined; no caller found |
| `COHORT_CREATED` / `COHORT_UPDATED` / `COHORT_DELETED` | `publishCohortEvent` | `cohort.service` create / update / delete |
| `COHORT_MEMBER_CREATED` | `publishCohortMemberEvent('created')` | `cohortMembers.service` create, `cron.service` auto-assign |
| `COHORT_MEMBER_UPDATED` / `COHORT_MEMBER_DELETED` | `publishCohortMemberEvent` | `cohortMembers.service` update/delete, `cohort.service` (members of an updated cohort) |
| `COHORT_ACADEMIC_YEAR_CREATED` | `publishCohortAcademicYearEvent('created')` | `cohortAcademicYear.service` insert |
| `COHORT_ACADEMIC_YEAR_UPDATED` / `_DELETED` | same helper | defined; no caller found |

**Payload building**
- User events (`UserService.publishUserEvent`): for create/update the service loads the full user (profile, tenant/role data, custom fields, cohorts) and sends it as `data`; if that fetch fails it falls back to `{ userId }`. The wrapper catches and logs all errors, so it never throws to the caller.
- Cohort events: `data.type` is rewritten using the `TYPE_OF_CENTER` custom field (`000a7469-2721-4c7b-8180-52812a0f6fe7`). `COHORT` with `regular`/`remote` becomes `regularCenter`/`remoteCenter`; `BATCH` becomes `regularBatch`/`remoteBatch`, with the value looked up from the parent cohort (`parentId`) in `FieldValues`. If the lookup fails the original type is kept.

**Failure semantics**: publishing is fire-and-forget in most call sites (`.catch` logs). A Kafka outage never fails the API request and does not roll back the DB write; events are not retried beyond the client's own retries.

**Example**: creating a batch under center `C1` whose `TYPE_OF_CENTER` is `remote` sends `{ eventType: "COHORT_CREATED", cohortId, data: { type: "remoteBatch", ... } }` keyed by the batch ID, so all events of one cohort land in one partition in order.

## Other Kafka traffic

Audit events do not use `KafkaService`; they are emitted by `@tekdi/audit-logger` to topic `audit.events` (see [common.md](./common.md#audit-logging)).

## Common Issues & Solutions

### Issue: No events appear
**Solution**: `KAFKA_ENABLED` must be exactly `true`. Check logs for `Kafka producer connected` and for the warning `Kafka is disabled`. Verify `KAFKA_BROKERS` (not `KAFKA_HOST`).

### Issue: Event missing fields after an update
**Solution**: Update events carry the full user as read after the write; if that read failed the event only holds `{ userId }`. Check the error log `Failed to fetch user data for Kafka event`.

### Common Mistakes to Avoid
1. Awaiting a publish inside a request path that must not depend on Kafka
2. Publishing before the DB write commits
3. Assuming per-type topics; there is a single topic and consumers filter on `eventType`
