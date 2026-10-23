import { MobileValidationError, PhoneNumberUtil } from './phone-number.util';

describe('PhoneNumberUtil.validateAndNormalize', () => {
  describe('valid mobile numbers per country', () => {
    it.each([
      ['IN', '9876543210', '+919876543210'],
      ['US', '2015550123', '+12015550123'],
      ['CA', '6135550123', '+16135550123'],
      ['GB', '7400123456', '+447400123456'],
      ['AU', '412345678', '+61412345678'],
      ['DE', '15123456789', '+4915123456789'],
      ['JP', '9012345678', '+819012345678'],
      ['BR', '11961234567', '+5511961234567'],
      ['SG', '81234567', '+6581234567'],
      ['AE', '501234567', '+971501234567'],
    ])('%s %s -> %s', (country, mobile, e164) => {
      expect(PhoneNumberUtil.validateAndNormalize(country, mobile)).toEqual({
        valid: true,
        e164,
        countryCode: country,
      });
    });
  });

  describe('input formats normalise to the same E.164', () => {
    it.each([
      '9876543210',
      '98765 43210',
      '98765-43210',
      '09876543210',
      '+91 9876543210',
      '+91-9876543210',
      '+919876543210',
    ])('IN %s', (mobile) => {
      expect(PhoneNumberUtil.validateAndNormalize('IN', mobile).e164).toBe(
        '+919876543210'
      );
    });

    it('accepts a numeric value', () => {
      expect(PhoneNumberUtil.validateAndNormalize('IN', 9876543210).e164).toBe(
        '+919876543210'
      );
    });

    it('accepts a lowercase country code', () => {
      expect(PhoneNumberUtil.validateAndNormalize('in', '9876543210')).toEqual({
        valid: true,
        e164: '+919876543210',
        countryCode: 'IN',
      });
    });
  });

  describe('invalid numbers', () => {
    it.each([
      ['IN', '12345'],
      ['IN', '123456'],
      ['IN', '987654321'],
      ['IN', '98765432101'],
      ['IN', '0000000000'],
      ['IN', 'abcdefghij'],
      ['IN', '+91abcdefghij'],
      ['IN', '9876543210 ext 12'],
      ['IN', ''],
      ['GB', '9876543210'],
    ])('%s %s', (country, mobile) => {
      expect(PhoneNumberUtil.validateAndNormalize(country, mobile)).toEqual({
        valid: false,
        error: MobileValidationError.INVALID_MOBILE,
      });
    });
  });

  it('rejects a number that belongs to another country', () => {
    expect(
      PhoneNumberUtil.validateAndNormalize('US', '+919876543210').error
    ).toBe(MobileValidationError.COUNTRY_MISMATCH);
  });

  it('rejects a landline', () => {
    expect(PhoneNumberUtil.validateAndNormalize('IN', '1234567890').error).toBe(
      MobileValidationError.NOT_MOBILE
    );
  });

  it.each(['XX', '', '+91', null])('rejects country %p', (country) => {
    expect(
      PhoneNumberUtil.validateAndNormalize(country, '9876543210').error
    ).toBe(MobileValidationError.INVALID_COUNTRY);
  });

  it('accepts GB +44 numbers in the Guernsey range for GB', () => {
    expect(PhoneNumberUtil.validateAndNormalize('GB', '7911123456')).toEqual({
      valid: true,
      e164: '+447911123456',
      countryCode: 'GB',
    });
  });
});
