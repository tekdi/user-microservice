-- Task 20 (Swadhaar, client Phase 1): Employee ID, Organization Code, Organization Name
-- Run once per environment (QA, then prod) BEFORE deploying the matching user-service build.
-- The user service has no TypeORM migrations and synchronize is off.
-- Rollback: 020_user_organisation_fields.down.sql

BEGIN;

-- 1. User columns
ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "employeeId"       varchar(50),
  ADD COLUMN IF NOT EXISTS "organisationCode" varchar(30),
  ADD COLUMN IF NOT EXISTS "organisationName" varchar(150);

CREATE INDEX IF NOT EXISTS idx_users_organisation_code
  ON public."Users" ("organisationCode");

-- Duplicate check (organisationCode, employeeId) is case-insensitive on employeeId.
-- Not UNIQUE: Users link to tenants many-to-many, so uniqueness per tenant is
-- enforced in the service (user-adapter.ts employeeIdExists).
CREATE INDEX IF NOT EXISTS idx_users_org_employee
  ON public."Users" ("organisationCode", LOWER("employeeId"));

-- 2. Organisations lookup: one name per code per tenant.
CREATE TABLE IF NOT EXISTS public."Organisations" (
  "organisationId" uuid         NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"       uuid         NULL,
  "code"           varchar(30)  NOT NULL,
  "name"           varchar(150) NOT NULL,
  "createdBy"      uuid         NULL,
  "createdAt"      timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_Organisations" PRIMARY KEY ("organisationId")
);

-- COALESCE so a NULL tenant still gets one row per code (ON CONFLICT relies on it).
CREATE UNIQUE INDEX IF NOT EXISTS uq_organisations_tenant_code
  ON public."Organisations" (COALESCE("tenantId", '00000000-0000-0000-0000-000000000000'::uuid), "code");

COMMIT;
