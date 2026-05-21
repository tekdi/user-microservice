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

export function standardizeSlugInput(input: string): string {
  // Lowercase, remove accents, keep [a-z0-9_], collapse spaces to nothing.
  // Use NFKD so accents become combining marks; then strip them.
  const s = String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacritics
    .replace(/\s+/g, '') // remove spaces
    .replace(/[^a-z0-9_]/g, ''); // remove special chars
  return s;
}

export function standardizeNameForSlug(firstName: string, lastName?: string) {
  const a = standardizeSlugInput(firstName);
  const b = lastName ? standardizeSlugInput(lastName) : '';
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
    // Internal alumni: random, non-identifiable
    return randomBase36(8);
  }

  // External: human-readable name + random suffix
  const base = standardizeNameForSlug(firstName, lastName ?? undefined);
  const suffix = randomBase36(6);
  return `${base}_${suffix}`;
}

export function isValidStandardSlug(slug: string): boolean {
  const s = String(slug || '').trim();
  if (!s) return false;
  if (s !== s.toLowerCase()) return false;
  return /^[a-z0-9_]+$/.test(s);
}

