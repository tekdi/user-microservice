import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';


export class AuthUtils {
  constructor() { }

  generateOtp(otpDigits) {
    const minValue = Math.pow(10, otpDigits - 1);
    const maxValue = Math.pow(10, otpDigits) - 1;
    return crypto.randomInt(minValue, maxValue);
  }

  calculateHash = (data, key) => {
    const hash = crypto.createHmac('sha256', key).update(data).digest('hex');
    return hash;
  };
}
