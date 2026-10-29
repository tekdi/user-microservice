import { createHash } from "crypto";

/**
 * Pure builders from our rows to DevRev field maps. No I/O here, so every
 * mapping rule is unit-tested in learner-payloads.spec.ts.
 *
 * Field names and enum values follow the DevRev schemas agreed for the Aspire
 * workspace (learner_profile, alp_enrollment). Builders return names without
 * the tnt__ prefix; toCustomFields() adds it.
 */

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
  /** Country name resolved from the latest membership's user_cohort_country_id. */
  applicationCountry: string | null;
  /** learner_profile field name -> raw FieldValues.value (DEVREV_PROFILE_FIELD_MAP). */
  customFields: Record<string, string | null>;
}

export interface EnrollmentSource {
  /** Cohort.cohortId, for the allowlist and DevRevSync.cohortId. */
  cohortId: string;
  /** Cohort.name: part of the DevRev key and sent as the cohort field. */
  cohortName: string;
  /** CohortMembers.status */
  status: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface PathwaySource {
  /** pathways.key: stable and unique, part of the DevRev key. */
  pathwayKey: string;
  pathwayName: string;
  /** user_pathways.status: ACTIVE, COMPLETED, WITHDRAWN or INACTIVE. */
  status: string;
  isActive: boolean | null;
  activatedAt: Date | string | null;
}

export type FieldMap = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

// ---------- keys ----------

export const learnerProfileUniqueKey = (userId: string) => `LRNR:${userId}`;

/**
 * The one place alp_enrollment keys are built: ALPE:{userId}:{cohort name},
 * the format the seed script and the LMS and assessment services use
 * (decided 2026-10-29, replacing cohortId). A learner in two cohorts with
 * the same name gets one record, and renaming a cohort starts a new record.
 */
export function enrollmentKeys(
  userId: string,
  cohortName: string
): { externalId: string; uniqueKey: string } {
  const externalId = `${userId}:${cohortName.trim()}`;
  return { externalId, uniqueKey: `ALPE:${externalId}` };
}

/** The one place elp_pathway keys are built: ELPP:{userId}:{pathways.key}. */
export function pathwayKeys(
  userId: string,
  pathwayKey: string
): { externalId: string; uniqueKey: string } {
  const externalId = `${userId}:${pathwayKey}`;
  return { externalId, uniqueKey: `ELPP:${externalId}` };
}

// ---------- enum mapping ----------

/**
 * user_pathways.status -> elp_pathway.status. DevRev has no "Withdrawn"
 * value for pathways, so a withdrawn pathway is Inactive (and not current).
 */
export function pathwayStatus(status: string): string | undefined {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "Active";
    case "COMPLETED":
      return "Completed";
    case "INACTIVE":
    case "WITHDRAWN":
      return "Inactive";
    default:
      return undefined;
  }
}

/**
 * CohortMembers.status -> alp_enrollment.is_enrolled. Shortlisted means
 * enrolled (decided 2026-10-28); "active" is treated as shortlisted
 * throughout. Unknown for inactive and archived.
 */
export function isEnrolled(status: string): boolean | undefined {
  switch ((status ?? "").toLowerCase()) {
    case "shortlisted":
    case "active":
      return true;
    case "applied":
    case "submitted":
    case "rejected":
    case "dropout":
      return false;
    default:
      return undefined;
  }
}

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
 * CohortMembers.status -> lifecycle_stage: the pre-enrollment and exit
 * stages, which this service owns (Q2, decided 2026-10-28). Dropout means
 * Withdrawn. Stages after enrollment (In Progress, Completed, Passed,
 * Failed - ...) need course data and are not sent from here.
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

/**
 * Fields.name compared without case or punctuation, so "iAmFirst-Generation…"
 * and "iamfirstgeneration…" match.
 */
export function normalizeFieldName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The learner_profile field a custom field feeds, by Fields.name prefix
 * (longest match wins), or undefined.
 */
export function profileFieldFor(
  fieldName: string,
  map: Record<string, string[]>
): string | undefined {
  const name = normalizeFieldName(fieldName);
  let best: { target: string; length: number } | undefined;
  for (const [target, prefixes] of Object.entries(map)) {
    for (const prefix of prefixes) {
      if (name.startsWith(prefix) && prefix.length > (best?.length ?? 0)) {
        best = { target, length: prefix.length };
      }
    }
  }
  return best?.target;
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

/**
 * The learner_profile fields this service owns (section 7.2 of the technical
 * solution). The summary fields (latest_alp_*, is_alumni, ELP fields) have no
 * owning service yet and are never sent. `onUnknown` hears about answers
 * that can't be mapped; they are left out, never sent as a guess.
 */
export function buildLearnerProfile(
  src: LearnerSource,
  revUserId: string | null,
  onUnknown: (field: string) => void = () => undefined
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
  };

  for (const [name, raw] of Object.entries(src.customFields ?? {})) {
    if (!MAPPABLE_PROFILE_FIELDS.has(name)) continue;
    const text = (raw ?? "").trim();
    if (!text) continue;
    if (!BOOLEAN_PROFILE_FIELDS.has(name)) {
      fields[name] = text;
      continue;
    }
    const value = toBool(text);
    if (value === undefined) onUnknown(name);
    fields[name] = value;
  }
  return fields;
}

/**
 * The alp_enrollment fields this service owns. The LMS sends the progress,
 * completion and assessment fields; is_latest_attempt has no owner yet.
 */
export function buildAlpEnrollment(
  src: LearnerSource,
  enrollment: EnrollmentSource,
  learnerProfileId: string | null
): FieldMap {
  const status = (enrollment.status ?? "").toLowerCase();
  return {
    learner_profile: learnerProfileId ?? undefined,
    external_id: enrollmentKeys(src.userId, enrollment.cohortName).externalId,
    aspire_user_id: src.userId,
    cohort: enrollment.cohortName,
    application_date: toDate(enrollment.createdAt),
    application_status: applicationStatus(status),
    is_enrolled: isEnrolled(status),
    lifecycle_stage: lifecycleStage(status),
    // updatedAt is the best date available: CohortMembers keeps no status history.
    withdrawal_date:
      status === "dropout" ? toDate(enrollment.updatedAt) : undefined,
  };
}

/** The elp_pathway fields this service owns; the LMS sends progress and last_activity_at. */
export function buildElpPathway(
  src: LearnerSource,
  pathway: PathwaySource,
  learnerProfileId: string | null,
  onUnknown: (field: string, value: string) => void = () => undefined
): FieldMap {
  const status = pathwayStatus(pathway.status);
  if (status === undefined && pathway.status) onUnknown("status", pathway.status);
  return {
    learner_profile: learnerProfileId ?? undefined,
    external_id: pathwayKeys(src.userId, pathway.pathwayKey).externalId,
    aspire_user_id: src.userId,
    pathway_code: pathway.pathwayKey,
    pathway_name: pathway.pathwayName,
    activated_at: toDate(pathway.activatedAt),
    status,
    // Only an ACTIVE row can be current, whatever is_active says.
    is_current:
      (pathway.status ?? "").toUpperCase() === "ACTIVE" &&
      pathway.isActive === true,
  };
}

export function pathwayTitle(
  src: LearnerSource,
  pathway: PathwaySource
): string {
  return `${fullName(src) || src.userId} · ${pathway.pathwayName}`;
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
