import {
  CountryCode,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberWithError,
} from 'libphonenumber-js/max';

// 'max' metadata is required: the default build validates by length only and
// cannot report the number type (mobile vs landline).

// US/CA numbers can never be classified as MOBILE - they always come back as
// FIXED_LINE_OR_MOBILE, so that type must be accepted too.
const ALLOWED_MOBILE_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

export enum MobileValidationError {
  INVALID_COUNTRY = 'INVALID_COUNTRY',
  INVALID_MOBILE = 'INVALID_MOBILE',
  COUNTRY_MISMATCH = 'COUNTRY_MISMATCH',
  NOT_MOBILE = 'NOT_MOBILE',
}

export interface MobileValidationResult {
  valid: boolean;
  error?: MobileValidationError;
  e164?: string; // e.g. +919876543210
  countryCode?: string; // ISO 3166-1 alpha-2, e.g. IN
}

export class PhoneNumberUtil {
  /**
   * Validates a mobile number against the user-selected country and returns
   * it in E.164. Lengths and number ranges per country come from the library
   * metadata - no country-specific rules are kept in this codebase.
   */
  static validateAndNormalize(
    countryCode: string,
    mobile: string | number
  ): MobileValidationResult {
    const iso = String(countryCode ?? '').trim().toUpperCase();
    if (!isSupportedCountry(iso)) {
      return { valid: false, error: MobileValidationError.INVALID_COUNTRY };
    }

    let parsed;
    try {
      parsed = parsePhoneNumberWithError(String(mobile ?? ''), iso as CountryCode);
    } catch {
      return { valid: false, error: MobileValidationError.INVALID_MOBILE };
    }

    // The library silently drops an extension ("ext 12") from E.164, so reject it.
    if (!parsed.isValid() || parsed.ext) {
      return { valid: false, error: MobileValidationError.INVALID_MOBILE };
    }

    // A number typed with its own "+<code>" overrides the selected country in
    // the library; it must still belong to the selected country.
    if (parsed.countryCallingCode !== getCountryCallingCode(iso as CountryCode)) {
      return { valid: false, error: MobileValidationError.COUNTRY_MISMATCH };
    }

    if (!ALLOWED_MOBILE_TYPES.has(parsed.getType())) {
      return { valid: false, error: MobileValidationError.NOT_MOBILE };
    }

    return { valid: true, e164: parsed.number, countryCode: iso };
  }
}
