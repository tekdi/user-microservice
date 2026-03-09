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
 * Get the real client IP from the request.
 * Use when the app is behind a trusted proxy (e.g. AWS ALB) that sets X-Forwarded-For.
 * Keycloak will log this IP when the backend forwards it on the token request.
 * Safe to call with null/undefined or non-Express request; returns undefined instead of throwing.
 */
export function getClientIp(req: Request | undefined | null): string | undefined {
  if (!req) return undefined;
  try {
    const forwarded = req.headers?.[X_FORWARDED_FOR];
    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      const first = String(forwarded[0]).split(',')[0].trim();
      if (first) return first;
    }
    return req.ip || req.socket?.remoteAddress;
  } catch {
    return undefined;
  }
}
