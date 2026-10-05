import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { APIID } from "src/common/utils/api-id.config";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const RECAPTCHA_TIMEOUT_MS = 5000;

@Injectable()
export class CaptchaService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Verifies a reCAPTCHA token with Google. Fails closed: any problem
   * (blank token, missing secret, Google error, network failure) returns false.
   */
  async verify(captchaToken: string): Promise<boolean> {
    if (typeof captchaToken !== "string" || !captchaToken.trim()) {
      return false;
    }

    const secretKey = this.configService.get<string>("RECAPTCHA_SECRET_KEY");
    if (!secretKey) {
      LoggerUtil.error(
        "CAPTCHA verification unavailable: secret key is not configured",
        undefined,
        APIID.LOGIN
      );
      return false;
    }

    try {
      const res = await axios.post(
        RECAPTCHA_VERIFY_URL,
        new URLSearchParams({
          secret: secretKey,
          response: captchaToken,
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: RECAPTCHA_TIMEOUT_MS,
        }
      );
      return res?.data?.success === true;
    } catch (error) {
      // Deliberately generic: do not log Google's response, the token or the secret.
      LoggerUtil.error(
        "CAPTCHA verification request failed",
        undefined,
        APIID.LOGIN
      );
      return false;
    }
  }
}
