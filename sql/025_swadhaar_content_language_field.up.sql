-- Swadhaar: the learner's preferred course language (English / Hindi / Marathi), chosen in the
-- learner app's language modal and read back at login so it follows the learner to any device.
-- Swadhaar had no such field: the app wrote to a field id from another backend and the save failed.
-- One text value, the language name ('English' / 'Hindi' / 'Marathi'). Swadhaar tenant only.
-- context / contextType NULL: valid for every user role (same as 021 branch_other); isEditable so
-- the learner's own profile update may set it. Only data, no code change.
-- Idempotent: safe to run more than once. Run the whole file so COMMIT runs too.

BEGIN;

INSERT INTO public."Fields" (
  "fieldId", "name", "label", "type", "state", "status", "required", "ordering",
  "onlyUseInSubform", "context", "contextType", "tenantId", "fieldAttributes", "maxLength"
) VALUES (
  'b75ee994-7bee-4660-ad80-1bcff62ae5b5', 'content_language', 'CONTENT_LANGUAGE', 'text', 'active', 'active', false, 26,
  false, NULL, NULL, '35529b5d-526f-4da5-bc6e-64f740023d26',
  '{"isRequired": false, "isEditable": true, "isMultiSelect": false}', 20
)
ON CONFLICT ("fieldId") DO NOTHING;

COMMIT;
