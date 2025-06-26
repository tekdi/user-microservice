import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class RecaptchaService {
  async validateToken(token: string): Promise<void> {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const recaptchaSite = process.env.RECAPTCHA_SITE;
    const response = await axios.post(recaptchaSite, null, {
      params: {
        secret,
        response: token,
      },
    });

    if (!response.data.success) {
      throw new UnauthorizedException('CAPTCHA validation failed');
    }
  }
}
