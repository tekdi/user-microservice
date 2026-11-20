-- Rollback for 021_branch_other_field.up.sql
-- WARNING: drops every stored "Other" branch name. Take a backup first.

BEGIN;

DELETE FROM public."FieldValues" WHERE "fieldId" = '7ff04020-7805-4be0-b49f-f88281a92448';
DELETE FROM public."Fields" WHERE "fieldId" = '7ff04020-7805-4be0-b49f-f88281a92448';

COMMIT;
