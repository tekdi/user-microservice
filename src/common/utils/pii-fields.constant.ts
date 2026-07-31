/**
 * Custom field (Fields.name) substrings identifying "USERS"-context custom fields that
 * hold address-line/city/state/pincode or mobile-type PII, and therefore must be blanked
 * out by the user-anonymization flow (see PostgresUserService.anonymizeUsers).
 *
 * These field codes are tenant/admin-configured at runtime (there is no seeded/hardcoded
 * list in this service) — this list reflects the known naming convention in use
 * (e.g. permanent_residence_address_line_1, current_residence_address_post_code) and
 * should be extended if a tenant configures differently-named PII fields.
 */
export const PII_CUSTOM_FIELD_NAME_PATTERNS: string[] = [
  'address_line',
  'address_city',
  'address_state',
  'address_post_code',
  'pincode',
  'post_code',
  'mobile',
  'whatsapp',
];

export function isPiiCustomField(fieldName: string | null | undefined): boolean {
  if (!fieldName) {
    return false;
  }
  const normalized = fieldName.toLowerCase();
  return PII_CUSTOM_FIELD_NAME_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}
