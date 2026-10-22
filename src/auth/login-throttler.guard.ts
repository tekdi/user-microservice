import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";

/**
 * Login throttle that internal services (pratham-microservice cron/ERP webhook) can skip
 * by sending the shared INTERNAL_SERVICE_SECRET in the x-internal-secret header.
 * Everyone else stays on the per-IP limit. Unset secret = nobody skips.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const expected = process.env.INTERNAL_SERVICE_SECRET;
    const received = context.switchToHttp().getRequest().headers?.["x-internal-secret"];
    if (!expected || typeof received !== "string") {
      return false;
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
