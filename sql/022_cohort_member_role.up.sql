-- Task 16a (Swadhaar R3-2, option B): a group-specific role on each group membership.
-- A user's own role (Admin, Trainer, DI, ARM, ...) stays in "UserRolesMapping" and is never changed by this.
-- Inside one group the user is a 'learner' or a 'reviewer'; the same user can be a reviewer in one group
-- and a learner in another.
--
-- Run once per environment (QA, then prod) BEFORE deploying the matching user-service build
-- (synchronize is off). Run the whole file so COMMIT runs too. Safe to run more than once.
-- Rollback: 022_cohort_member_role.down.sql
--
-- Existing memberships become 'learner'. Adding a column with a constant default is a metadata-only
-- change in PostgreSQL 11+, so it does not rewrite the table.

BEGIN;

ALTER TABLE public."CohortMembers"
  ADD COLUMN IF NOT EXISTS "cohortRoleCode" varchar(50) NOT NULL DEFAULT 'learner';

-- Group member list filtered by group role (cohortmember/list, list-application)
CREATE INDEX IF NOT EXISTS idx_cohortmembers_cohort_role
  ON public."CohortMembers" ("cohortId", "cohortRoleCode");

COMMIT;
