-- Task 8a (Swadhaar): organisation roles and group (cohort) roles for the Swadhaar tenant.
-- Needs 023_role_type.up.sql first. Run once per environment; safe to run more than once.
-- Rollback: 024_swadhaar_roles_seed.down.sql
--
-- Organisation roles: the three roles already exist and users already hold them, so they are only
-- typed and given a display name here. Their codes (trainer, cfl, arm) stay: the middleware role
-- checks and the apps use them. The display name is the current name; change it with
--   UPDATE public."Roles" SET "displayName" = '<new name>' WHERE "roleId" = '<roleId>';
-- (or PUT rbac/roles/update/:id with displayName) once the client confirms the wording.
--
-- Group roles: learner and reviewer. Their codes must match COHORT_ROLE_CODES in
-- src/cohortMembers/entities/cohort-member.entity.ts. They get no privileges and are never mapped to a
-- user in "UserRolesMapping"; the user service refuses that.

BEGIN;

UPDATE public."Roles"
   SET "roleType" = 'organisation',
       "displayName" = COALESCE("displayName", name),
       "updatedAt" = now()
 WHERE "tenantId" = '35529b5d-526f-4da5-bc6e-64f740023d26'
   AND code IN ('trainer', 'cfl', 'arm');

UPDATE public."Roles"
   SET "displayName" = COALESCE("displayName", name),
       "updatedAt" = now()
 WHERE "tenantId" = '35529b5d-526f-4da5-bc6e-64f740023d26'
   AND code = 'admin'
   AND "displayName" IS NULL;

INSERT INTO public."Roles"
  (name, code, "tenantId", description, "isSystemRole", "isPermissionEditable", "displayName", "roleType")
SELECT v.name, v.code, '35529b5d-526f-4da5-bc6e-64f740023d26', v.description, true, false, v.name, 'cohort'
  FROM (VALUES
    ('Learner',  'learner',  'Group role: takes the learning path assigned to the group.'),
    ('Reviewer', 'reviewer', 'Group role: reviews the learners of the group.')
  ) AS v(name, code, description)
 WHERE NOT EXISTS (
   SELECT 1 FROM public."Roles" r
    WHERE r."tenantId" = '35529b5d-526f-4da5-bc6e-64f740023d26' AND r.code = v.code
 );

COMMIT;
