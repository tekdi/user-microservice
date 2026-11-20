-- Task 8 (Swadhaar): a role type and a display name on every role.
--   roleType    'admin'        platform admin roles (Admin)
--               'organisation' a user's own job role (Trainer, District Incharge, ARM)
--               'cohort'       a role inside one group (Learner, Reviewer) - never given to a user
--                              directly; stored on "CohortMembers"."cohortRoleCode" (sql/022)
--   displayName the label the apps show. "code" stays the fixed key that the middleware role checks
--               and the apps use, so a rename never changes it.
--
-- Run once per environment (QA, then prod) BEFORE deploying the matching user-service build
-- (synchronize is off; the Role entity reads both columns). Run the whole file so COMMIT runs too.
-- Safe to run more than once. Then run 024_swadhaar_roles_seed.up.sql (Task 8a).
-- Rollback: 023_role_type.down.sql

BEGIN;

ALTER TABLE public."Roles"
  ADD COLUMN IF NOT EXISTS "displayName" varchar(100);

-- Adding a column with a constant default is metadata-only in PostgreSQL 11+ (no table rewrite).
ALTER TABLE public."Roles"
  ADD COLUMN IF NOT EXISTS "roleType" varchar(20) NOT NULL DEFAULT 'organisation';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_roles_role_type') THEN
    ALTER TABLE public."Roles"
      ADD CONSTRAINT chk_roles_role_type CHECK ("roleType" IN ('admin', 'organisation', 'cohort'));
  END IF;
END $$;

-- Role list by tenant and type (rbac/roles/list/roles with filters.roleType)
CREATE INDEX IF NOT EXISTS idx_roles_tenant_role_type
  ON public."Roles" ("tenantId", "roleType");

-- Swadhaar tenant: the Admin role is a platform admin role, not an organisation role.
UPDATE public."Roles"
   SET "roleType" = 'admin', "updatedAt" = now()
 WHERE "tenantId" = '35529b5d-526f-4da5-bc6e-64f740023d26'
   AND code = 'admin'
   AND "roleType" <> 'admin';

COMMIT;
