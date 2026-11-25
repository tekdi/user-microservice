-- Org Management and Branch Management (admin portal, src/masters).
-- Run once per environment (QA, then prod) BEFORE deploying the matching user-service build.
-- The user service has no TypeORM migrations and synchronize is off.
-- Idempotent: safe to run more than once. Run the whole file so COMMIT runs too.
-- Rollback: 026_org_branch_management.down.sql
--
-- Nothing is deleted from these lists: admins deactivate (isActive = false). Users who
-- already hold a deactivated org or branch keep it.

BEGIN;

-- 1. Organisations: active flag and who last changed it.
ALTER TABLE public."Organisations"
  ADD COLUMN IF NOT EXISTS "isActive"  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedBy" uuid;

-- 2. Branches (the `block` field's option table): branch code and active flag.
--    Existing branches get no code (NULL); admins can't set one later because the code
--    is locked once created, so a code backfill, if wanted, is a separate data script.
ALTER TABLE public."block"
  ADD COLUMN IF NOT EXISTS "code"     varchar(20),
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

-- One branch code per tenant, case-insensitive. NULL codes (existing branches) are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_tenant_code
  ON public."block" ("tenantId", UPPER("code"))
  WHERE "code" IS NOT NULL;

-- Branch list filters by district, and the name check runs per district.
CREATE INDEX IF NOT EXISTS idx_block_tenant_district
  ON public."block" ("tenantId", "controllingfieldfk");

COMMIT;
