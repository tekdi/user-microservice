-- Rollback for 025_swadhaar_content_language_field.up.sql
-- WARNING: drops every learner's saved course language. Take a backup first.

BEGIN;

DELETE FROM public."FieldValues" WHERE "fieldId" = 'b75ee994-7bee-4660-ad80-1bcff62ae5b5';
DELETE FROM public."Fields" WHERE "fieldId" = 'b75ee994-7bee-4660-ad80-1bcff62ae5b5';

COMMIT;
