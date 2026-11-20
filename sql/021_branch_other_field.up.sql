-- Task 28 (R2-1): "Other" branch. The Branch field (`block`) is a table-sourced dropdown, so the server
-- accepts only block ids there. A branch that is not in the list is stored in this free-text custom field.
-- context / contextType NULL make it valid for every user role (same as states / city / block).
-- Only data, no code change: create validates it as a text field, update needs isEditable = true.
-- Idempotent: safe to run more than once. Run the whole file so COMMIT runs too.

BEGIN;

INSERT INTO public."Fields" (
  "fieldId", "name", "label", "type", "state", "status", "required", "ordering",
  "onlyUseInSubform", "context", "contextType", "fieldAttributes", "maxLength"
) VALUES (
  '7ff04020-7805-4be0-b49f-f88281a92448', 'branch_other', 'BRANCH_OTHER', 'text', 'active', 'active', false, 18,
  false, NULL, NULL, '{"isRequired": false, "isEditable": true, "isMultiSelect": false}', 150
)
ON CONFLICT ("fieldId") DO NOTHING;

COMMIT;
