-- Rollback for 023_role_type.up.sql
-- Roll back 024_swadhaar_roles_seed first. Drops every role type and display name.

BEGIN;

DROP INDEX IF EXISTS public.idx_roles_tenant_role_type;
ALTER TABLE public."Roles" DROP CONSTRAINT IF EXISTS chk_roles_role_type;
ALTER TABLE public."Roles" DROP COLUMN IF EXISTS "roleType";
ALTER TABLE public."Roles" DROP COLUMN IF EXISTS "displayName";

COMMIT;
