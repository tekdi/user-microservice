import { randomBytes } from 'node:crypto';
import { ReferralEntitySubType, ReferralEntityType } from '../referrals.types';

export const DEFAULT_REFERRAL_BASE_URL = () => {
  const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  return `${frontendUrl}/registration`;
};

export function buildReferLink(slug: string, baseUrl?: string): string {
  const base = baseUrl ?? DEFAULT_REFERRAL_BASE_URL();
  const s = String(slug || '').trim();
  if (!s) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}refer=${encodeURIComponent(s)}`;
}

function randomBase36(length: number): string {
  // Generate more entropy than needed, then slice.
  // Base36 chars: 0-9a-z
  const raw = randomBytes(Math.ceil((length * 5) / 2)).toString('hex'); // hex
  const asBase36 = BigInt('0x' + raw).toString(36);
  return asBase36.padStart(length, '0').slice(0, length);
}

// Allowed chars in a user-provided slug: letters, digits, -, _, ., ~
const USER_SLUG_PATTERN = /^[a-zA-Z0-9\-_\.~]+$/;

export function isValidUserProvidedSlug(slug: string): boolean {
  return USER_SLUG_PATTERN.test(slug);
}

// Used only for name-based auto-generation (strips to safe base36-compatible chars)
function normalizeNamePart(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_]/g, '');
}

// Keep for resolveSlug backward compat \u2014 only trims, no stripping
export function standardizeSlugInput(input: string): string {
  return String(input ?? '').trim();
}

export function standardizeNameForSlug(firstName: string, lastName?: string) {
  const a = normalizeNamePart(firstName);
  const b = lastName ? normalizeNamePart(lastName) : '';
  if (a && b) return `${a}_${b}`;
  return a || b;
}

export function generateReferralSlug(params: {
  type: ReferralEntityType;
  subType: ReferralEntitySubType;
  firstName: string;
  lastName?: string | null;
}): string {
  const { type, subType, firstName, lastName } = params;

  if (type === ReferralEntityType.INTERNAL && subType === ReferralEntitySubType.ALUMNI) {
    return randomBase36(8);
  }

  const base = standardizeNameForSlug(firstName, lastName ?? undefined);
  const suffix = randomBase36(6);
  return `${base}_${suffix}`;
}

export function isValidStandardSlug(slug: string): boolean {
  const s = String(slug || '').trim();
  if (!s) return false;
  return /^[a-z0-9_]+$/.test(s);
}

