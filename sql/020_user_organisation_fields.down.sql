-- Rollback for 020_user_organisation_fields.up.sql
-- WARNING: drops every stored Employee ID / Organization value. Take a backup first.

BEGIN;

DROP INDEX IF EXISTS public.uq_organisations_tenant_code;
DROP TABLE IF EXISTS public."Organisations";

DROP INDEX IF EXISTS public.idx_users_org_employee;
DROP INDEX IF EXISTS public.idx_users_organisation_code;

ALTER TABLE public."Users"
  DROP COLUMN IF EXISTS "organisationName",
  DROP COLUMN IF EXISTS "organisationCode",
  DROP COLUMN IF EXISTS "employeeId";

COMMIT;
