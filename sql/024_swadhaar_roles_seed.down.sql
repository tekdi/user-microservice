-- Rollback for 024_swadhaar_roles_seed.up.sql (Swadhaar tenant only).
-- Removes the Learner / Reviewer role rows. Group memberships keep their "cohortRoleCode" (sql/022),
-- so the group screens keep working. The organisation roles keep their type and display name; 023's
-- rollback drops those columns.

BEGIN;

DELETE FROM public."Roles"
 WHERE "tenantId" = '35529b5d-526f-4da5-bc6e-64f740023d26'
   AND code IN ('learner', 'reviewer')
   AND "roleType" = 'cohort'
   AND NOT EXISTS (SELECT 1 FROM public."UserRolesMapping" u WHERE u."roleId" = "Roles"."roleId");

COMMIT;
