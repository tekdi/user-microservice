import { Request } from 'express';

const X_FORWARDED_FOR = 'x-forwarded-for';

/**
 * Normalize IPv4-mapped IPv6 address to plain IPv4 for cleaner Keycloak logs.
 * e.g. ::ffff:127.0.0.1 -> 127.0.0.1, ::ffff:10.0.0.1 -> 10.0.0.1
 */
export function normalizeIpForForwarding(ip: string | undefined): string | undefined {
  if (!ip || typeof ip !== 'string') return ip;
  const trimmed = ip.trim();
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    return trimmed.slice(7); // "::ffff:".length === 7
  }
  return trimmed;
}

/**
 * True if the IP is private/internal or loopback. Used to decide when it's safe
 * to trust X-Forwarded-For (only when the direct connection is from our infra).
 */
function isPrivateOrLoopback(ip: string | undefined): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const s = ip.trim().toLowerCase();
  if (s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1') return true;
  if (s.startsWith('10.')) return true;
  if (s.startsWith('172.')) {
    const second = parseInt(s.slice(4, 7), 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (s.startsWith('192.168.')) return true;
  if (s.startsWith('::ffff:10.') || s.startsWith('::ffff:192.168.') || s.startsWith('::ffff:172.')) return true;
  return false;
}

/**
 * Correct way to extract real client IP (for Keycloak and logging).
 * - If X-Forwarded-For header exists: use the FIRST IP (real user). Example:
 *   X-Forwarded-For: 27.107.73.230, 10.0.4.15  -> 27.107.73.230
 * - Else: fallback to req.socket.remoteAddress
 * We only trust the header when the direct connection is from a private/internal IP
 * (e.g. behind AWS ALB + Kubernetes ingress), so we do not trust spoofed headers from the internet.
 */
export function getClientIp(req: Request | undefined | null): string | undefined {
  if (!req) return undefined;
  try {
    const forwarded = req.headers?.[X_FORWARDED_FOR];
    const remoteAddress = req.socket?.remoteAddress;

    if (forwarded) {
      const first = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : String(forwarded[0] ?? '').split(',')[0].trim();
      if (first) {
        // Only trust header when direct connection is from our infra (ALB/ingress)
        if (isPrivateOrLoopback(remoteAddress)) {
          return first;
        }
      }
    }

    return req.ip || remoteAddress;
  } catch {
    return undefined;
  }
}

/**
 * Returns debug info for logging client IP behavior (x-forwarded-for, extracted IP, req.ip, remoteAddress).
 * Use in login/auth flows to verify correct extraction and forwarding to Keycloak.
 */
export function getClientIpDebug(req: Request | undefined | null): {
  xForwardedFor: string | undefined;
  clientIp: string | undefined;
  reqIp: string | undefined;
  remoteAddress: string | undefined;
} {
  if (!req) {
    return { xForwardedFor: undefined, clientIp: undefined, reqIp: undefined, remoteAddress: undefined };
  }
  const forwarded = req.headers?.[X_FORWARDED_FOR];
  const xForwardedFor = typeof forwarded === 'string' ? forwarded : Array.isArray(forwarded) ? forwarded.join(', ') : undefined;
  return {
    xForwardedFor,
    clientIp: getClientIp(req),
    reqIp: req.ip,
    remoteAddress: req.socket?.remoteAddress,
  };
}
