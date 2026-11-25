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

/** B9 POST /connect/admin/reports → reportType (one per export file) */
export enum ConnectReportType {
  ACTIVE_MEMBERS = "active_members",
  LEFT_MEMBERS = "left_members",
  REPORTED_MEMBERS = "reported_members",
}

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
/**
 * Reason stored for "Safety concern about {name}" → "Email me the steps",
 * which sends no reason. Not in the A2 pick list.
 */
export const CONNECT_SAFETY_CONCERN_REASON = "safety_concern";
/** Saved in safety_reports.details (NOT NULL) when a member sends no details */
export const CONNECT_SAFETY_CONCERN_DEFAULT_DETAILS =
  "Safety concern raised from the member's Connect profile (Email me the steps).";
export const CONNECT_REPORT_REASON_KEYS: string[] = [
  CONNECT_SAFETY_CONCERN_REASON,
  ...CONNECT_REPORT_REASONS.map((r) => r.key),
];

/**
 * Safety concern email to the reporter (notification service template,
 * context USER). Only the reporter is emailed; admins see reports in the
 * Connect report export.
 */
export const CONNECT_SAFETY_EMAIL = {
  // same context as the other user-service emails (pathways, cohort members)
  CONTEXT: "USER",
  REPORTER_KEY: "OnConnectSafetyConcernReporter",
} as const;

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
  /** Country filter: multi-select, capped only to bound the query */
  COUNTRY_FILTER_MAX: 50,
  SEARCH_MIN_CHARS: 2,
  SEARCH_MAX_WORDS: 5,
  REPORT_SUBJECT_MAX: 200,
  REPORT_DETAILS_MAX: 2000,
  REPORTS_PER_DAY: 10,
  ADMIN_LIST_DEFAULT_LIMIT: 20,
  ADMIN_LIST_MAX_LIMIT: 100,
  /** B9: the export worker asks for 1000 rows a page */
  REPORT_EXPORT_DEFAULT_LIMIT: 100,
  REPORT_EXPORT_MAX_LIMIT: 1000,
  REPORT_EXPORT_MAX_COUNTRIES: 300,
} as const;

/**
 * Limits the frontend needs for its forms and filters (GET /connect/options →
 * limits), so they are defined only here. The DTOs use CONNECT_LIMITS too.
 */
export const CONNECT_CLIENT_LIMITS = {
  headlineMax: CONNECT_LIMITS.HEADLINE_MAX,
  aboutMaxWords: CONNECT_LIMITS.ABOUT_MAX_WORDS,
  aboutMaxChars: CONNECT_LIMITS.ABOUT_MAX_CHARS,
  openToMin: CONNECT_LIMITS.OPEN_TO_MIN,
  openToMax: CONNECT_LIMITS.OPEN_TO_MAX,
  careerDomainFilterMax: CONNECT_LIMITS.CAREER_DOMAIN_FILTER_MAX,
  openToFilterMax: CONNECT_LIMITS.LIST_MAX_MULTI_FILTER,
  countryFilterMax: CONNECT_LIMITS.COUNTRY_FILTER_MAX,
  listPageSize: CONNECT_LIMITS.LIST_DEFAULT_LIMIT,
  listMaxPageSize: CONNECT_LIMITS.LIST_MAX_LIMIT,
  searchMinChars: CONNECT_LIMITS.SEARCH_MIN_CHARS,
  reportSubjectMax: CONNECT_LIMITS.REPORT_SUBJECT_MAX,
  reportDetailsMax: CONNECT_LIMITS.REPORT_DETAILS_MAX,
} as const;

/** Roles (Roles.code, per tenant) allowed to call /connect/admin/* */
export const CONNECT_ADMIN_ROLE_CODES = ["admin"];
/**
 * B9 reports: also open to any role mapped to this privilege
 * (Privileges.code, ticked in the admin app's Privilege Management)
 */
export const CONNECT_REPORT_PRIVILEGE = "connect.report.view";
/**
 * B4–B6 master data (career domain groups, career domains, "Open to"):
 * besides the admin role, a role with one of these privileges may call them.
 */
export const CONNECT_MASTERDATA_PRIVILEGES = {
  VIEW: "connect.masterdata.view",
  EDIT: "connect.masterdata.edit",
} as const;

/** linkedin.com/in/<handle>, with or without scheme / www / country subdomain */
export const LINKEDIN_PROFILE_REGEX =
  /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/([\w%-]+)\/?$/i;

export const CONNECT_CACHE = {
  // v3: career domain groups moved to their own table
  OPTIONS_KEY: "connect:options:v3",
  OPTIONS_TTL: 3600,
  MEMBER_KEY: (userId: string) => `connect:member:${userId}`,
  MEMBER_TTL: 600,
  // v4: Connect fields only; name / location / pathway / cohort read live
  PROFILE_KEY: (userId: string) => `connect:profile:v4:${userId}`,
  PROFILE_TTL: 300,
  // v2: every active country with its member count (was members only)
  COUNTRIES_KEY: "connect:countries-filter:v2",
  COUNTRIES_TTL: 600,
  // per viewer, so one viewer's totals can be cleared (report / LinkedIn visit)
  COUNT_KEY: (viewerId: string, hash: string) =>
    `connect:count:${viewerId}:${hash}`,
  COUNT_VIEWER_PATTERN: (viewerId: string) => `connect:count:${viewerId}:*`,
  COUNT_TTL: 60,
  REPORT_DAY_KEY: (userId: string, day: string) =>
    `connect:reports:${userId}:${day}`,
  REPORT_DAY_TTL: 86400,
  // v2: { isAdmin, privileges } (connect.* privilege codes of the caller)
  ADMIN_KEY: (tenantId: string, userId: string) =>
    `connect:admin:v2:${tenantId}:${userId}`,
  ADMIN_TTL: 300,
  REPORT_ACCESS_KEY: (tenantId: string, userId: string) =>
    `connect:report-access:${tenantId}:${userId}`,
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
  REPORT_ACCESS: {
    code: "CONNECT_REPORT_ACCESS",
    message: "You don't have access to Connect reports",
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
/** Key column lengths: groups and domains varchar(60), "Open to" varchar(50) */
export const CONNECT_KEY_MAX = { CAREER: 60, OPEN_TO: 50 } as const;
export const toConnectKey = (text: string, maxLength?: number): string => {
  const key = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    // runs are already collapsed to one "_", so trim at most one per end
    .replace(/^_|_$/g, "");
  // a long name must not make a key longer than the column
  return maxLength ? key.slice(0, maxLength).replace(/_$/, "") : key;
};
