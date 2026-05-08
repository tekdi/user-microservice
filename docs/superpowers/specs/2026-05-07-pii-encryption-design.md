# PII Encryption Design — User Microservice
**Date:** 2026-05-07  
**Compliance:** DPDPA (Digital Personal Data Protection Act)  
**Scope:** `Users` table — Phase 1  
**Status:** Decisions finalised ✅

---

## 1. Objective

Encrypt all Personally Identifiable Information (PII) stored in the `Users` table at rest. Only ciphertext will persist in the DB. Encryption/decryption happens transparently in the service layer using AES-256 with a key from an environment variable (`PII_ENCRYPTION_KEY`).

---

## 2. PII Fields in Scope (Users Table)

Under DPDPA, **name is classified as Personal Data** — `firstName`, `lastName`, `middleName` are all required to be encrypted.

| Column | DB Column Name (after migration) | Encryption Mode | Searchable in DB? |
|---|---|---|---|
| `email` | `email` (same, value encrypted) | Deterministic (AES-256-CBC) | YES |
| `mobile` | `mobile` (same, value encrypted) | Deterministic (AES-256-CBC) | YES |
| `dob` | `dob` (same, value encrypted) | Random-IV (AES-256-GCM) | NO |
| `firstName` | `firstName` (same, value encrypted) | Deterministic (AES-256-CBC) | YES |
| `lastName` | `lastName` (same, value encrypted) | Deterministic (AES-256-CBC) | YES |
| `middleName` | `middleName` (same, value encrypted) | Random-IV (AES-256-GCM) | NO |
| `address` | `address` (same, value encrypted) | Random-IV (AES-256-GCM) | NO |
| `pincode` | `pincode` (same, value encrypted) | Random-IV (AES-256-GCM) | NO |

---

## 3. Column Strategy — Keep Same Names, Store Encrypted Values ✅

**Decision:** Keep existing column names (`email`, `mobile`, `dob`, `firstName`, etc.) in the `Users` table. The encrypted ciphertext is stored directly in these columns. The separate `encryptedEmail`, `encryptedMobile`, `encryptedDob` columns (currently in DB) will be **dropped**.

**Why this is better:**
- No entity renames or response field mapping changes needed
- Reporting/analytics tools that query the DB directly will receive encrypted values — which is the correct DPDPA behaviour (they should not see plaintext PII)
- Simpler migration — encrypt in-place, drop the redundant `encryptedXxx` columns

### Final DB Column State After Migration

| Column | Type | Value |
|---|---|---|
| `email` | `TEXT` | AES encrypted ciphertext |
| `mobile` | `TEXT` | AES encrypted ciphertext |
| `dob` | `TEXT` | AES encrypted ciphertext |
| `firstName` | `TEXT` | AES encrypted ciphertext |
| `lastName` | `TEXT` | AES encrypted ciphertext |
| `middleName` | `TEXT` | AES encrypted ciphertext |
| `address` | `TEXT` | AES encrypted ciphertext (was already TEXT) |
| `pincode` | `TEXT` | AES encrypted ciphertext |
| `encryptedEmail` | — | **DROPPED** |
| `encryptedMobile` | — | **DROPPED** |
| `encryptedDob` | — | **DROPPED** |

---

## 4. Encryption Approach

### Two Modes

**Deterministic (AES-256-CBC, fixed IV derived from key)**
- Used for: `email`, `mobile`, `firstName`, `lastName`
- Same plaintext → same ciphertext every time
- Allows DB-level `WHERE email = encryptDeterministic(input)`
- Slightly lower security than random-IV (no IV randomness) — acceptable trade-off for searchability

**Random-IV (AES-256-GCM, authenticated)**
- Used for: `dob`, `middleName`, `address`, `pincode`
- Same plaintext → different ciphertext each time
- Maximum security, tamper-proof (GCM auth tag)
- Not searchable at DB level — no need to search by these fields

### Key Configuration
- **Env var:** `PII_ENCRYPTION_KEY` — 32-byte hex string (256-bit)
- **Deterministic IV:** first 16 bytes of `SHA-256(PII_ENCRYPTION_KEY)` — fixed, derived from key
- **Random IV:** `crypto.randomBytes(12)` — regenerated per encryption
- **Storage format (GCM):** `iv_base64:authTag_base64:ciphertext_base64`
- **Storage format (CBC):** `ciphertext_base64` (IV is fixed/derived, no need to store)
- **Key Rotation:** requires a data migration script to re-encrypt all rows

---

## 5. Database Migration Steps

```
Step 1: Widen column types to TEXT (to fit ciphertext)
Step 2: Encrypt all existing rows in-place (via migration script)
Step 3: Drop redundant encryptedXxx columns
Step 4: Deploy new service code
```

**Step 1 — SQL:**
```sql
ALTER TABLE "Users" ALTER COLUMN "email" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "mobile" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "dob" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "firstName" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "lastName" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "middleName" TYPE TEXT;
ALTER TABLE "Users" ALTER COLUMN "pincode" TYPE TEXT;
-- address is already TEXT
```

**Step 3 — SQL (after data encryption script completes):**
```sql
ALTER TABLE "Users" DROP COLUMN IF EXISTS "encryptedEmail";
ALTER TABLE "Users" DROP COLUMN IF EXISTS "encryptedMobile";
ALTER TABLE "Users" DROP COLUMN IF EXISTS "encryptedDob";
```

> **Critical:** Steps 1-3 must complete and be verified **before** deploying new service code. The service code assumes all PII columns contain ciphertext.

---

## 6. New Service: `EncryptionService`

**Location:** `src/common/services/encryption.service.ts`

```typescript
@Injectable()
export class EncryptionService {
  // AES-256-CBC — fixed IV derived from key. Same input → same output.
  encryptDeterministic(value: string): string

  // AES-256-GCM — random IV. Same input → different output each time.
  encryptRandom(value: string): string

  // Detects mode from ciphertext format and decrypts accordingly.
  decrypt(value: string): string

  // Convenience: encrypts all PII fields on a user object before DB write.
  encryptUserPII(user: Partial<User>): Partial<User>

  // Convenience: decrypts all PII fields on a user object after DB read.
  decryptUserPII(user: Partial<User>): Partial<User>
}
```

**PII field → encryption mode mapping (inside EncryptionService):**
```
email       → encryptDeterministic
mobile      → encryptDeterministic
firstName   → encryptDeterministic
lastName    → encryptDeterministic
dob         → encryptRandom
middleName  → encryptRandom
address     → encryptRandom
pincode     → encryptRandom
```

---

## 7. API Impact Analysis

### 7.1 CREATE — `POST /user/create`

| Aspect | Change |
|---|---|
| **Request body** | No change — consumer sends plaintext |
| **Service layer** | Call `encryptUserPII()` before `usersRepository.save()` |
| **Keycloak** | Receives plaintext before encryption — no change |
| **Response** | Call `decryptUserPII()` before returning |

---

### 7.2 GET — `GET /user/read/:userId`

| Aspect | Change |
|---|---|
| **DB fetch** | Fetches ciphertext from all PII columns |
| **Service layer** | Call `decryptUserPII()` after fetch |
| **Response** | Plaintext PII returned to consumer — field names unchanged |

---

### 7.3 UPDATE — `PATCH /user/update/:userid`

| Aspect | Change |
|---|---|
| **Request body** | No change — consumer sends plaintext |
| **Service layer** | Call `encryptUserPII()` on updated fields before save |
| **Keycloak** | Receives plaintext — no change |
| **Response** | `decryptUserPII()` before returning |

---

### 7.4 LIST / SEARCH — `POST /user/list` ⚠️ MOST IMPACTED

Current PII filters:
```json
{ "filters": { "email": ["user@example.com"], "mobile": "9876543210" } }
```

**Changes:**
| Filter | Old Behaviour | New Behaviour |
|---|---|---|
| `email` | `WHERE email ILIKE ?` | `encryptDeterministic(input)` → `WHERE email = ?` (exact match) |
| `mobile` | `WHERE mobile = ?` | `encryptDeterministic(input)` → `WHERE mobile = ?` (exact match) |
| `firstName` | `WHERE firstName ILIKE ?` | `encryptDeterministic(input)` → `WHERE firstName = ?` (exact match) |
| `lastName` | `WHERE lastName ILIKE ?` | `encryptDeterministic(input)` → `WHERE lastName = ?` (exact match) |

> **Breaking change for partial/wildcard search:** `ILIKE '%rahul%'` is no longer possible. Search must be exact. This is an accepted trade-off for DPDPA compliance.

After DB fetch → call `decryptUserPII()` on each result before building response.

---

### 7.5 CHECK USER — `POST /user/check`

`ExistUserDto` has `email`, `mobile`, `firstName`, `lastName`.

| Field | Change |
|---|---|
| `email` | `encryptDeterministic(input)` → `WHERE email = ?` |
| `mobile` | `encryptDeterministic(input)` → `WHERE mobile = ?` |
| `firstName` | `encryptDeterministic(input)` → `WHERE firstName = ?` |
| `lastName` | `encryptDeterministic(input)` → `WHERE lastName = ?` |

---

### 7.6 FORGOT PASSWORD — `POST /user/forgot-password`

| Aspect | Change |
|---|---|
| Input email lookup | `encryptDeterministic(email)` → `WHERE email = ?` |
| Response | No PII exposed |

---

### 7.7 SEND OTP — `POST /user/send-otp`

| Aspect | Change |
|---|---|
| Mobile lookup | `encryptDeterministic(mobile)` → `WHERE mobile = ?` |
| Sending SMS | `decrypt(user.mobile)` → pass plaintext to SMS provider |

---

### 7.8 SEND OTP ON MAIL — `POST /user/send-otp-mail`

| Aspect | Change |
|---|---|
| Email lookup | `encryptDeterministic(email)` → `WHERE email = ?` |
| Sending email | `decrypt(user.email)` → pass plaintext to mail provider |

---

### 7.9 PASSWORD RESET OTP — `POST /user/password-reset-otp`

Same pattern as 7.7 / 7.8 — encrypt input for lookup, decrypt for sending.

---

### 7.10 USER HIERARCHY VIEW — `POST /user/hierarchy-view`

| Aspect | Change |
|---|---|
| Email lookup | `encryptDeterministic(email)` → `WHERE email = ?` |
| Domain extraction | `decrypt(user.email)` → then extract domain |

---

### 7.11 DELETE — `DELETE /user/delete/:userId`

Lookup by UUID — **no impact.** Encrypted row deleted with no special handling.

---

### 7.12 SUGGEST USERNAME — `POST /user/suggestUsername`

Input `firstName`/`lastName` come from request body, not DB — **no impact on input.**  
If fetching existing users for uniqueness: call `decryptUserPII()` on fetched rows.

---

### 7.13 PASSWORD RESET LINK — `POST /user/password-reset-link`

| Aspect | Change |
|---|---|
| Fetching user email to send link | `decrypt(user.email)` → pass to mail provider |

---

## 8. Response Shape — No Contract Change

API consumers always receive **decrypted plaintext**. Field names are unchanged.

```json
{
  "userId": "uuid",
  "firstName": "Rahul",
  "lastName": "Sharma",
  "email": "rahul@example.com",
  "mobile": "9876543210",
  "dob": "1995-04-12",
  "address": "123 Main St",
  "pincode": "110001"
}
```

The DB stores ciphertext in these columns. The service decrypts transparently before responding.

---

## 9. Files to Create / Modify

| File | Action | What Changes |
|---|---|---|
| `src/common/services/encryption.service.ts` | **CREATE** | Core AES-256 service with deterministic + random-IV modes |
| `src/common/services/encryption.service.spec.ts` | **CREATE** | Unit tests for both encryption modes |
| `src/user/entities/user-entity.ts` | **MODIFY** | Remove `encryptedEmail/Mobile/Dob` columns; change PII column types to `text` |
| `src/user/user.service.ts` | **MODIFY** | Inject `EncryptionService`; encrypt on write, decrypt on read; update all search filter logic |
| `src/user/dto/user-search.dto.ts` | **MODIFY** | Remove `@IsEmail` from `filters.email` (string only now) |
| `src/user/user.module.ts` | **MODIFY** | Add `EncryptionService` to providers |
| `src/common/common.module.ts` | **MODIFY** | Export `EncryptionService` |
| `migrations/YYYYMMDD-encrypt-pii-users.ts` | **CREATE** | Widen columns, encrypt existing rows, drop `encryptedXxx` columns |
| `.env` / `.env.example` | **MODIFY** | Add `PII_ENCRYPTION_KEY=<32-byte-hex>` |

---

## 10. What Does NOT Change

| Field | Reason |
|---|---|
| `username` | Not PII — used for login, stays plaintext |
| `enrollmentId` | Unique identifier — stays plaintext |
| `gender` | Not sensitive personal data under DPDPA |
| `status`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | Operational metadata |
| `userId` | Primary key UUID |
| Keycloak data | Outside service boundary — Keycloak stores its own copy |
| Non-PII filters in `/user/list` | `status`, `role`, `cohortId`, `tenantId` — no change |

---

## 11. Decisions Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Keep same column names, store encrypted values in-place | Cleaner — no entity renames, no response mapping changes, reporting tools correctly see ciphertext |
| 2 | Drop `encryptedEmail`, `encryptedMobile`, `encryptedDob` columns | Redundant after in-place encryption strategy |
| 3 | `firstName`, `lastName` are PII and must be encrypted | DPDPA classifies full name as Personal Data |
| 4 | `firstName`, `lastName`, `email`, `mobile` use deterministic encryption | Required for DB-level search (exact match) |
| 5 | `dob`, `middleName`, `address`, `pincode` use random-IV | No search requirement — maximum security |
| 6 | `ILIKE` / partial search on PII fields removed | Impossible after encryption — exact match only |
| 7 | Data export (Phase 2) | Not in scope for Phase 1 |
| 8 | `FieldValues` encryption | Phase 2 — after Phase 1 is stable |
