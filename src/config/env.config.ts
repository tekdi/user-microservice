import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Log environment variables for debugging
console.log('Environment file path:', envPath);
console.log('OTP_DIGITS:', process.env.OTP_DIGITS);
console.log('KEYCLOAK_REALM_RSA_PUBLIC_KEY:', process.env.KEYCLOAK_REALM_RSA_PUBLIC_KEY ? 'Set' : 'Not Set');

export const envConfig = {
  otpDigits: process.env.OTP_DIGITS,
  keycloakPublicKey: process.env.KEYCLOAK_REALM_RSA_PUBLIC_KEY,
}; 