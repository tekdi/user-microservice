// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import axios from 'axios';

// @Injectable()
// export class RecaptchaService {
//   async validateToken(token: string): Promise<void> {
//     const secret = process.env.RECAPTCHA_SECRET_KEY;
//     const recaptchaSite = process.env.RECAPTCHA_SITE;
//     const response = await axios.post(recaptchaSite, null, {
//       params: {
//         secret,
//         response: token,
//       },
//     });

//     if (!response.data.success) {
//       throw new UnauthorizedException('CAPTCHA validation failed');
//     }
//   }
// }

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class RecaptchaService {
  constructor(private readonly configService: ConfigService) {}

  async validateToken(token: string): Promise<void> {
    // Input validation
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new UnauthorizedException('Invalid reCAPTCHA token');
    }

    // Fetch environment variables using ConfigService
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const recaptchaSite = process.env.RECAPTCHA_SITE;

    // Validate environment configuration
    if (!secret || !recaptchaSite) {
      throw new Error('reCAPTCHA configuration is missing');
    }

    try {
      // Make request to reCAPTCHA verification endpoint
      // Using axios to post the token for validation
      const response = await axios.post(recaptchaSite, null, {
        params: {
          secret,
          response: token,
        },
      });

      if (!response.data.success) {
        throw new UnauthorizedException('CAPTCHA validation failed');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Optional: log error here with a logger service

      throw new UnauthorizedException('CAPTCHA validation service unavailable');
    }
  }
}
