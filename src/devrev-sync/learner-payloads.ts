import { createHash } from "crypto";

/**
 * Pure builders from our rows to DevRev field maps. No I/O here, so every
 * mapping rule is unit-tested in learner-payloads.spec.ts.
 *
 * Field names and enum values follow the DevRev schemas agreed for the Aspire
 * workspace (learner_profile, alp_enrollment). Builders return names without
 * the tnt__ prefix; toCustomFields() adds it.
 */

/** Tag that marks an ALP graduate (also gates pathway assignment). */
export const ALUMNI_TAG = "completed_alumni";

/** learner_profile fields that DEVREV_PROFILE_FIELD_MAP may target. */
export const MAPPABLE_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  "university",
  "study_major",
  "education_level",
  "first_generation",
  "limited_income",
]);
const BOOLEAN_PROFILE_FIELDS: ReadonlySet<string> = new Set([
  "first_generation",
  "limited_income",
]);

export interface LearnerSource {
  userId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  gender: string | null;
  dob: Date | string | null;
  currentCountry: string | null;
  createdAt: Date | string | null;
  temporaryPassword: boolean | null;
  autoTags: string[] | null;
  /** Country name resolved from the latest membership's user_cohort_country_id. */
  applicationCountry: string | null;
  /** DevRev field name -> raw FieldValues.value, already mapped by fieldId. */
  customFields: Record<string, string | null>;
}

export interface EnrollmentSource {
  cohortId: string;
  /** Cohort.name, e.g. ALP-2026-C2. Part of the DevRev key. */
  cohortName: string;
  /** CohortMembers.status */
  status: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  /** True only on the learner's most recent ALP membership. */
  isLatest: boolean;
}

export type FieldMap = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

// ---------- keys ----------

export const learnerProfileUniqueKey = (userId: string) => `LRNR:${userId}`;

export const enrollmentExternalId = (userId: string, cohortName: string) =>
  `${userId}:${cohortName}`;

export const enrollmentUniqueKey = (userId: string, cohortName: string) =>
  `ALPE:${enrollmentExternalId(userId, cohortName)}`;

// ---------- enum mapping ----------

/** CohortMembers.status -> alp_enrollment.application_status */
export function applicationStatus(status: string): string | undefined {
  switch ((status ?? "").toLowerCase()) {
    case "applied":
    case "submitted":
      return "Pending";
    case "shortlisted":
    case "active":
    case "dropout":
      return "Shortlisted";
    case "rejected":
      return "Rejected";
    default:
      return undefined; // inactive, archived: no application state to report
  }
}

/**
 * CohortMembers.status -> lifecycle_stage, for the stages this service knows.
 * Stages after enrollment (In Progress, Completed, Passed, Failed - ...) come
 * from course progress in the LMS; ownership is open question Q2.
 */
export function lifecycleStage(status: string): string | undefined {
  switch ((status ?? "").toLowerCase()) {
    case "applied":
    case "submitted":
      return "Applied";
    case "rejected":
      return "Rejected";
    case "shortlisted":
    case "active":
      return "Shortlisted";
    case "dropout":
      return "Withdrawn";
    default:
      return undefined;
  }
}

// ---------- value helpers ----------

/** YYYY-MM-DD for DevRev date fields; undefined for empty or invalid input. */
export function toDate(
  value: Date | string | null | undefined
): string | undefined {
  if (!value) return undefined;
  // A date-only string (e.g. a DATE column read as text) is already right;
  // parsing it would risk shifting the day with the server's time zone.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10);
}

/** Parses yes/no style custom-field answers; undefined when unclear. */
export function toBool(value: string | null | undefined): boolean | undefined {
  const v = (value ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return undefined;
}

export function fullName(
  src: Pick<LearnerSource, "firstName" | "middleName" | "lastName">
): string {
  return [src.firstName, src.middleName, src.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Adds the tnt__ prefix and drops empty values so DevRev only gets what we have. */
export function toCustomFields(fields: FieldMap): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    out[`tnt__${key}`] = value;
  }
  return out;
}

/** Stable sha256 of a payload, to skip API calls when nothing changed. */
export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---------- builders ----------

/** Stock Rev User: only standard fields (custom fields are rejected there). */
export function buildRevUser(
  src: LearnerSource,
  revOrgId: string
): Record<string, any> {
  const body: Record<string, any> = {
    display_name: fullName(src) || src.userId,
    external_ref: src.userId,
    rev_org: revOrgId,
  };
  if (src.email) body.email = src.email;
  return body;
}

export function buildLearnerProfile(
  src: LearnerSource,
  latest: EnrollmentSource | null,
  revUserId: string | null
): FieldMap {
  const fields: FieldMap = {
    aspire_user_id: src.userId,
    full_name: fullName(src),
    email: src.email ?? undefined,
    rev_user_id: revUserId ?? undefined,
    gender: src.gender ?? undefined,
    date_of_birth: toDate(src.dob),
    application_country: src.applicationCountry ?? undefined,
    current_country: src.currentCountry ?? undefined,
    registration_date: toDate(src.createdAt),
    is_activated: src.temporaryPassword === false,
    is_alumni: (src.autoTags ?? []).includes(ALUMNI_TAG),
    latest_alp_cohort: latest?.cohortName,
    latest_alp_status: latest ? lifecycleStage(latest.status) : undefined,
  };

  for (const [name, raw] of Object.entries(src.customFields ?? {})) {
    if (!MAPPABLE_PROFILE_FIELDS.has(name)) continue;
    fields[name] = BOOLEAN_PROFILE_FIELDS.has(name)
      ? toBool(raw)
      : (raw ?? "").trim() || undefined;
  }
  return fields;
}

/** The alp_enrollment fields this service owns; the LMS sends the progress fields. */
export function buildAlpEnrollment(
  src: LearnerSource,
  enrollment: EnrollmentSource,
  learnerProfileId: string | null
): FieldMap {
  const status = (enrollment.status ?? "").toLowerCase();
  return {
    learner_profile: learnerProfileId ?? undefined,
    external_id: enrollmentExternalId(src.userId, enrollment.cohortName),
    aspire_user_id: src.userId,
    cohort: enrollment.cohortName,
    is_latest_attempt: enrollment.isLatest,
    application_date: toDate(enrollment.createdAt),
    application_status: applicationStatus(status),
    lifecycle_stage: lifecycleStage(status),
    withdrawal_date:
      status === "dropout" ? toDate(enrollment.updatedAt) : undefined,
  };
}

export function profileTitle(src: LearnerSource): string {
  return `${fullName(src) || "Learner"} · ${src.userId}`;
}

export function enrollmentTitle(
  src: LearnerSource,
  enrollment: EnrollmentSource
): string {
  return `${fullName(src) || src.userId} · ${enrollment.cohortName}`;
}
