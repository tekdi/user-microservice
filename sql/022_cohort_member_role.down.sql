-- Rollback for 022_cohort_member_role.up.sql
-- WARNING: drops every stored group role (Learner / Reviewer). Take a backup first.

BEGIN;

DROP INDEX IF EXISTS public.idx_cohortmembers_cohort_role;
ALTER TABLE public."CohortMembers" DROP COLUMN IF EXISTS "cohortRoleCode";

COMMIT;
