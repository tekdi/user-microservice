import { envConfig } from '../../config/env.config';

// Create a simple configuration object that can be used in DTOs
export const otpConfig = {
  getOtpDigits: () => {
    const digits = envConfig.otpDigits;
    console.log('OTP_DIGITS from config:', digits);
    if (!digits) {
      throw new Error('OTP_DIGITS is not set in environment variables');
    }
    return digits;
  },
  getOtpRegex: () => {
    const digits = envConfig.otpDigits;
    if (!digits) {
      throw new Error('OTP_DIGITS is not set in environment variables');
    }
    return new RegExp(`^\\d{${digits}}$`);
  }
};