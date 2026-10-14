# Security Issue Fix — Brute Force Attack / Probable Brute Force

**Finding:** Brute Force Attack / Probable Brute Force
**Severity:** High
**Component:** Backend
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)
**Environments:** Prod, QA
**Status:** In Progress

## Original Finding

The application lacks account lockout or CAPTCHA mechanisms for invalid login attempts,
allowing automated credential stuffing and brute force attacks against
`POST /user/v1/auth/login`.

## Solutions

### 1. Account lockout at Keycloak level — ✅ Implemented (verified working)

Keycloak's Brute Force Detection is enabled on the `pratham` realm
(Realm Settings → Security Defenses → Brute Force Detection):

- **Brute Force Mode:** Lockout temporarily
- **Max login failures:** configurable (tested at 2 and 5)
- **Wait increment / Max wait / Failure reset time:** 15 minutes

This was verified directly against Keycloak's admin REST API
(`GET /admin/realms/pratham/attack-detection/brute-force/users/{userId}`), which
confirmed the account is actually marked `disabled: true` with a future
`failedLoginNotBefore` timestamp after the configured number of failed attempts.

Note: Keycloak intentionally returns the same generic
`"Invalid username or password"` error for a wrong password, a non-existent
username, and a locked account. This is a deliberate anti-user-enumeration
control, not a bug — it prevents an attacker from telling these cases apart
from the login response alone.

Limitation: this only protects one known/existing username against repeated
password guessing. It does not stop an attacker sweeping many different
(including non-existent) usernames from one source.

### 2. IP-based rate limiting on the login endpoint — ✅ Implemented

Added application-level rate limiting on `POST /auth/login` using
`@nestjs/throttler`, scoped to the login route only (no other endpoints
affected):

- **Limit:** 5 requests per 60 seconds per client IP
- **Files changed:**
  - `src/main.ts` — `app.set("trust proxy", 1)` so `req.ip` reflects the real
    client IP from `X-Forwarded-For` instead of the load balancer's IP
  - `src/auth/auth.module.ts` — `ThrottlerModule.forRoot([...])`
  - `src/auth/auth.controller.ts` — `@UseGuards(ThrottlerGuard)` on the
    `login` method
- On breach, returns `429 Too Many Requests` via the existing
  `AllExceptionsFilter`.

Notes:
- `user-microservice` runs 2 static replicas (no HPA) with no shared store
  (Redis) backing the throttler, so the counter is in-memory per pod. Worst
  case an attacker's effective limit is ~10 requests/60s across both pods
  instead of a clean 5 — still a large reduction from unlimited attempts
  today. Keycloak's per-account lockout remains the backstop regardless of
  which pod handles a given request.
- `trust proxy` hop count is currently set to `1` by default — needs
  confirmation from whoever owns the ALB/Istio ingress chain that this
  matches the real number of proxy hops in front of the service. If wrong,
  per-IP tracking will not key on the correct client IP.

### 3. CAPTCHA on login after repeated failures — ⏳ Not implemented yet

Planned, not yet built. Design agreed so far:

- Backend tracks failed login attempts (per username, via the existing
  Redis-backed cache module) and returns a `captchaRequired: true` flag in
  the login response once a threshold is crossed.
- Frontend renders a CAPTCHA widget (Google reCAPTCHA) only when that flag is
  set, and attaches the resulting `captchaToken` to the next login request.
- Backend verifies the token server-side against Google's `siteverify`
  endpoint before calling Keycloak — a request with a missing/invalid token
  is rejected without ever reaching Keycloak.
- Requires a new `captchaToken` field on `AuthDto` and changes on both
  frontend and backend; not started.

## Summary for Pentest / QA team

- Account lockout (Keycloak) and generic non-revealing error messages are
  already in place and verified working.
- IP-based rate limiting on the login endpoint is now implemented.
- CAPTCHA is the remaining piece of this finding and is planned as a
  follow-up.
