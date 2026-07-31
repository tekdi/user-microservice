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

// Field types that can never hold an address/phone-number style PII value (e.g. a checkbox
// toggle like "mobile_notifications_opt_in") — excluded even when the name matches a pattern,
// since a raw name match on a single word like "mobile" can't otherwise tell a phone-number
// field apart from an unrelated toggle of the same name.
const NON_PII_FIELD_TYPES = new Set(['checkbox']);

function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // split camelCase word boundaries
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * @param fieldName Fields.name (the custom field's code).
 * @param fieldType Fields.type, when available — used to rule out non-PII field types.
 */
export function isPiiCustomField(
  fieldName: string | null | undefined,
  fieldType?: string | null
): boolean {
  if (!fieldName) {
    return false;
  }
  if (fieldType && NON_PII_FIELD_TYPES.has(fieldType)) {
    return false;
  }
  const tokens = new Set(tokenize(fieldName));
  return PII_CUSTOM_FIELD_NAME_PATTERNS.some((pattern) => {
    const patternTokens = tokenize(pattern);
    return patternTokens.every((token) => tokens.has(token));
  });
}
