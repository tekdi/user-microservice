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
 * Only 172.16.0.0/12 (172.16.x - 172.31.x) is private; other 172.x are public.
 */
function isPrivateOrLoopback(ip: string | undefined): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const normalized = normalizeIpForForwarding(ip)?.toLowerCase() ?? ip.trim().toLowerCase();
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('172.')) {
    const second = parseInt(normalized.slice(4, 7), 10);
    return second >= 16 && second <= 31;
  }
  if (normalized.startsWith('192.168.')) return true;
  return false;
}

/**
 * True if the IP looks like a public (non-private, non-loopback) address.
 * Only 172.16.0.0/12 is treated as private for 172.x.
 */
function isPublicIp(ip: string | undefined): boolean {
  return !isPrivateOrLoopback(ip);
}

/**
 * Parse X-Forwarded-For into an array of IPs (left to right).
 */
function parseForwardedIps(forwarded: string | string[] | undefined): string[] {
  if (!forwarded) return [];
  const raw = typeof forwarded === 'string' ? forwarded : Array.isArray(forwarded) ? forwarded.join(',') : '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Correct way to extract real client IP (for Keycloak and logging).
 * Handles both header orders:
 * - Standard (ALB): X-Forwarded-For: 27.107.73.230, 10.0.4.15 → first = real user.
 * - Reversed (some ingresses): X-Forwarded-For: 10.0.4.15, 27.107.73.230 → last = real user.
 * We use: if the first IP is public, use it; else (first is private/internal proxy) use the last IP.
 * Fallback: req.socket.remoteAddress only when header missing or not trusted.
 * We do not use req.ip here so that trust proxy cannot bypass this validation.
 */
export function getClientIp(req: Request | undefined | null): string | undefined {
  if (!req) return undefined;
  try {
    const forwarded = req.headers?.[X_FORWARDED_FOR];
    const remoteAddress = req.socket?.remoteAddress;

    if (forwarded) {
      const ips = parseForwardedIps(forwarded);
      if (ips.length > 0 && isPrivateOrLoopback(remoteAddress)) {
        const first = ips[0];
        const last = ips[ips.length - 1];
        if (ips.length === 1) return first;
        if (isPublicIp(first)) return first;
        if (isPublicIp(last)) return last;
        return first;
      }
    }

    return remoteAddress;
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
