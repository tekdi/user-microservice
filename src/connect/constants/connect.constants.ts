export enum ConnectProfileStatus {
  ACTIVE = "ACTIVE",
  LEFT = "LEFT",
  SUSPENDED = "SUSPENDED",
}

/** safety_reports.status — created OPEN by a member, changed only by an admin */
export enum ConnectReportStatus {
  OPEN = "OPEN",
  ACTION_TAKEN = "ACTION_TAKEN",
  DISMISSED = "DISMISSED",
}
/** Statuses an admin can move a report to (OPEN is only set on create) */
export const CONNECT_REPORT_REVIEW_STATUSES = [
  ConnectReportStatus.ACTION_TAKEN,
  ConnectReportStatus.DISMISSED,
] as const;

export enum ConnectListSort {
  SAME_COHORT = "same_cohort",
  NEWEST_COHORT = "newest_cohort",
  NAME_ASC = "name_asc",
}

/** "LinkedIn visits" filter, always relative to the viewer */
export enum ConnectLinkedinVisit {
  ALL = "all",
  VISITED = "visited",
  NOT_VISITED = "not_visited",
  REPORTED = "reported",
}

/**
 * "Which of the following best describes you?" (pick 1).
 * Fixed list kept in code, stored as the key on connect_profiles.currentStatus.
 */
export const CONNECT_CURRENT_STATUSES = [
  { key: "student", label: "Student" },
  { key: "employed_self_employed", label: "Employed / Self-employed" },
  { key: "not_employed", label: "Not employed" },
] as const;
export const CONNECT_CURRENT_STATUS_KEYS: string[] =
  CONNECT_CURRENT_STATUSES.map((s) => s.key);

export const CONNECT_REPORT_REASONS = [
  { key: "harassment", label: "Harassment or inappropriate behavior" },
  { key: "spam", label: "Spam or unwanted contact" },
  { key: "misleading_profile", label: "Misleading profile" },
  { key: "privacy_concern", label: "Privacy concern" },
  { key: "other", label: "Other" },
] as const;
export const CONNECT_REPORT_REASON_KEYS: string[] = CONNECT_REPORT_REASONS.map(
  (r) => r.key
);

export const CONNECT_LIMITS = {
  HEADLINE_MAX: 150,
  OPEN_TO_MIN: 1,
  OPEN_TO_MAX: 2,
  ABOUT_MAX_WORDS: 100,
  ABOUT_MAX_CHARS: 1000,
  LIST_DEFAULT_LIMIT: 24,
  LIST_MAX_LIMIT: 48,
  LIST_MAX_MULTI_FILTER: 2,
  /** Career domain filter: up to 2 picks, groups and sub-domains together */
  CAREER_DOMAIN_FILTER_MAX: 2,
  SEARCH_MIN_CHARS: 2,
  SEARCH_MAX_WORDS: 5,
  REPORT_SUBJECT_MAX: 200,
  REPORT_DETAILS_MAX: 2000,
  REPORTS_PER_DAY: 10,
  ADMIN_LIST_DEFAULT_LIMIT: 20,
  ADMIN_LIST_MAX_LIMIT: 100,
} as const;

/** Roles (Roles.code, per tenant) allowed to call /connect/admin/* */
export const CONNECT_ADMIN_ROLE_CODES = ["admin"];

/** linkedin.com/in/<handle>, with or without scheme / www / country subdomain */
export const LINKEDIN_PROFILE_REGEX =
  /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/([\w%-]+)\/?$/i;

export const CONNECT_CACHE = {
  // v3: career domain groups moved to their own table
  OPTIONS_KEY: "connect:options:v3",
  OPTIONS_TTL: 3600,
  MEMBER_KEY: (userId: string) => `connect:member:${userId}`,
  MEMBER_TTL: 600,
  PROFILE_KEY: (userId: string) => `connect:profile:${userId}`,
  PROFILE_TTL: 600,
  COUNTRIES_KEY: "connect:member-countries",
  COUNTRIES_TTL: 600,
  COUNT_KEY: (hash: string) => `connect:count:${hash}`,
  COUNT_TTL: 60,
  REPORT_DAY_KEY: (userId: string, day: string) =>
    `connect:reports:${userId}:${day}`,
  REPORT_DAY_TTL: 86400,
  ADMIN_KEY: (tenantId: string, userId: string) =>
    `connect:admin:${tenantId}:${userId}`,
  ADMIN_TTL: 300,
} as const;

/** Error codes (sent in params.err) and their messages (params.errmsg) */
export const CONNECT_ERRORS = {
  NOT_A_MEMBER: {
    code: "CONNECT_NOT_A_MEMBER",
    message: "Join Aspire Connect to use this feature",
  },
  SUSPENDED: {
    code: "CONNECT_SUSPENDED",
    message: "Your access to Aspire Connect is restricted",
  },
  TERMS_REQUIRED: {
    code: "CONNECT_TERMS_REQUIRED",
    message: "Please accept the Connect community guidelines",
  },
  INVALID_LINKEDIN_URL: {
    code: "CONNECT_INVALID_LINKEDIN_URL",
    message: "Enter a LinkedIn profile URL like linkedin.com/in/your-name",
  },
  INVALID_OPTION: {
    code: "CONNECT_INVALID_OPTION",
    message: 'Selected career domain, status or "Open to" option is not valid',
  },
  ABOUT_TOO_LONG: {
    code: "CONNECT_ABOUT_TOO_LONG",
    message: "About me can be at most 100 words",
  },
  REQUIRED_FIELD: {
    code: "CONNECT_REQUIRED_FIELD",
    message:
      'About yourself, LinkedIn URL, career domain, status and "Open to" can\'t be removed',
  },
  NOTHING_TO_UPDATE: {
    code: "CONNECT_NOTHING_TO_UPDATE",
    message: "Send at least one field to update",
  },
  PROFILE_NOT_FOUND: {
    code: "CONNECT_PROFILE_NOT_FOUND",
    message: "This member profile is not available",
  },
  SELF_ACTION: {
    code: "CONNECT_SELF_ACTION",
    message: "You can't do this on your own profile",
  },
  INVALID_FILTER: {
    code: "CONNECT_INVALID_FILTER",
    message: "One or more filters are not valid",
  },
  INVALID_REPORT: {
    code: "CONNECT_INVALID_REPORT",
    message: "Member or concern is required",
  },
  REPORT_LIMIT: {
    code: "CONNECT_REPORT_LIMIT",
    message:
      "You have reached the daily report limit. Please try again tomorrow",
  },
  REPORT_NOT_FOUND: {
    code: "CONNECT_REPORT_NOT_FOUND",
    message: "Safety report not found",
  },
  ADMIN_ONLY: {
    code: "CONNECT_ADMIN_ONLY",
    message: "Only an admin of this tenant can do this",
  },
  DUPLICATE_KEY: {
    code: "CONNECT_DUPLICATE_KEY",
    message: "The same key is sent more than once",
  },
  GROUP_NAME_MISMATCH: {
    code: "CONNECT_GROUP_NAME_MISMATCH",
    message: "The same groupKey is sent with different groupName values",
  },
  GROUP_NOT_FOUND: {
    code: "CONNECT_GROUP_NOT_FOUND",
    message: "Career domain group not found. Send groupName to create it",
  },
  MASTER_NOT_FOUND: {
    code: "CONNECT_MASTER_NOT_FOUND",
    message: "Career domain, group or support offering not found",
  },
} as const;

/** Upper bound for one bulk create/update call on master data */
export const CONNECT_MASTER_BULK_MAX = 100;

/** Stable machine key, e.g. "Data & Analytics" → "data_analytics" */
export const CONNECT_KEY_REGEX = /^[a-z0-9]+(_[a-z0-9]+)*$/;
export const toConnectKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_+)|(_+$)/g, "");
