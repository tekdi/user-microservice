import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { APIID } from "src/common/utils/api-id.config";



@Injectable()
export class CaptchaService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Whether CAPTCHA verification is active. Defaults to enabled; set
   * CAPTCHA_ENABLED=false to switch it off (e.g. for local/dev environments).
   */
  isEnabled(): boolean {
    const raw = this.configService.get<string>("CAPTCHA_ENABLED");
    return raw?.toLowerCase() !== "false";
  }

  /**
   * Verifies a reCAPTCHA token with Google. Fails closed: any problem
   * (blank token, missing secret, Google error, network failure) returns false.
   * Short-circuits to true when CAPTCHA_ENABLED=false.
   */
  async verify(captchaToken: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return true;
    }

    if (typeof captchaToken !== "string" || !captchaToken.trim()) {
      return false;
    }
const RECAPTCHA_VERIFY_URL = this.configService.get<string>("RECAPTCHA_VERIFY_URL");
const RECAPTCHA_TIMEOUT_MS = this.configService.get<number>("RECAPTCHA_TIMEOUT_MS");
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
