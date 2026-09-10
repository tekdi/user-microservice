export enum ReferralEntityType {
  EXTERNAL = 'external',
  INTERNAL = 'internal',
}

export enum ReferralEntitySubType {
  ORGANISATION = 'organisation',
  UNIVERSITY = 'university',
  ALUMNI = 'alumni',
  INFLUENCER = 'influencer',
}

export enum ReferralEntityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}


// Enum values are stored lowercase. Clients and CSV rows may send any casing
// (e.g. "External", "INFLUENCER"), so normalize before validating/persisting.
export const normalizeReferralEnum = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
