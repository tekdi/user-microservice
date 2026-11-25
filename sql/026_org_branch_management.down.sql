-- Rollback for 026_org_branch_management.up.sql
-- WARNING: drops every branch code and every org/branch active flag, so deactivated
-- orgs and branches become active again. Take a backup first.

BEGIN;

DROP INDEX IF EXISTS public.idx_block_tenant_district;
DROP INDEX IF EXISTS public.uq_block_tenant_code;

ALTER TABLE public."block"
  DROP COLUMN IF EXISTS "isActive",
  DROP COLUMN IF EXISTS "code";

ALTER TABLE public."Organisations"
  DROP COLUMN IF EXISTS "updatedBy",
  DROP COLUMN IF EXISTS "isActive";

COMMIT;
