import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** A custom link type ID, e.g. don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/5. */
const LINK_TYPE_ID = /^don:core:[a-z0-9-]+:devo\/[A-Za-z0-9]+:custom_link_type\/\d+$/;

/**
 * Link types that must never be used. custom_link_type/4 is an accidental
 * second "Aspire learner record" that targets learner_profile; it is being
 * deprecated in DevRev (link types can't be deleted).
 */
export const DEPRECATED_LINK_TYPE_IDS: ReadonlySet<string> = new Set([
  "don:core:dvrv-in-1:devo/2qphGDPJVV:custom_link_type/4",
]);

/**
 * Every DevRev sync setting, read once from the environment.
 *
 * Sync is OFF unless DEVREV_SYNC_ENABLED=true. Each record type then has its
 * own switch, so one type can be turned off in production without a deploy.
 * See README.md in this folder for the full list and defaults.
 */
@Injectable()
export class DevRevSyncConfig {
  readonly enabled: boolean;
  readonly dryRun: boolean;
  readonly syncLearnerProfile: boolean;
  readonly syncAlpEnrollment: boolean;
  readonly syncRevUsers: boolean;

  readonly baseUrl: string;
  readonly token: string;
  readonly revOrgId: string;
  /** Empty when unset or invalid: links of that kind are then skipped. */
  readonly profileLinkTypeId: string;
  readonly recordLinkTypeId: string;

  readonly concurrency: number;
  readonly ratePerSecond: number;
  readonly maxAttempts: number;
  readonly debounceMs: number;
  readonly requestTimeoutMs: number;

  /** Cohort IDs to sync during a phased rollout. Empty = all cohorts. */
  readonly cohortAllowlist: Set<string>;
  /** Cohort.type values that count as ALP. Empty = every cohort is ALP. */
  readonly alpCohortTypes: Set<string>;
  /** FieldValues.fieldId -> learner_profile field name, e.g. { "<uuid>": "university" }. */
  readonly profileFieldMap: Record<string, string>;

  constructor(configService: ConfigService) {
    const get = (key: string, fallback = ""): string =>
      (configService.get<string>(key) ?? fallback).toString().trim();
    const flag = (key: string, fallback: boolean): boolean => {
      const value = get(key).toLowerCase();
      return value === "" ? fallback : value === "true";
    };
    const int = (key: string, fallback: number): number => {
      const value = Number(get(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    const list = (key: string): Set<string> =>
      new Set(
        get(key)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      );

    this.enabled = flag("DEVREV_SYNC_ENABLED", false);
    this.dryRun = flag("DEVREV_SYNC_DRY_RUN", false);
    this.syncLearnerProfile = flag("DEVREV_SYNC_LEARNER_PROFILE", true);
    this.syncAlpEnrollment = flag("DEVREV_SYNC_ALP_ENROLLMENT", true);
    this.syncRevUsers = flag("DEVREV_SYNC_REV_USERS", true);

    this.baseUrl = get("DEVREV_BASE_URL", "https://api.devrev.ai").replace(
      /\/+$/,
      ""
    );
    // DEVREV_API_TOKEN is the name the other services use; DEVREV_TOKEN is
    // still read so existing environments keep working.
    this.token = get("DEVREV_API_TOKEN") || get("DEVREV_TOKEN");
    this.revOrgId = get("DEVREV_REV_ORG_ID");
    this.profileLinkTypeId = this.linkTypeId("DEVREV_LINK_TYPE_PROFILE_ID", get);
    this.recordLinkTypeId = this.linkTypeId("DEVREV_LINK_TYPE_RECORD_ID", get);
    if (
      this.profileLinkTypeId &&
      this.profileLinkTypeId === this.recordLinkTypeId
    ) {
      this.errors.push(
        "DEVREV_LINK_TYPE_PROFILE_ID and DEVREV_LINK_TYPE_RECORD_ID are the same; links will not sync"
      );
      this.profileLinkTypeId = "";
      this.recordLinkTypeId = "";
    }

    this.concurrency = int("DEVREV_SYNC_CONCURRENCY", 2);
    this.ratePerSecond = int("DEVREV_SYNC_RATE_PER_SEC", 5);
    this.maxAttempts = int("DEVREV_SYNC_MAX_ATTEMPTS", 5);
    this.debounceMs = int("DEVREV_SYNC_DEBOUNCE_MS", 30000);
    this.requestTimeoutMs = int("DEVREV_SYNC_TIMEOUT_MS", 15000);

    this.cohortAllowlist = list("DEVREV_SYNC_COHORT_ALLOWLIST");
    this.alpCohortTypes = new Set(
      [...list("DEVREV_ALP_COHORT_TYPES")].map((t) => t.toLowerCase())
    );
    this.profileFieldMap = this.parseFieldMap(get("DEVREV_PROFILE_FIELD_MAP"));
  }

  /** True when the worker can run: enabled, and either dry-run or a token is set. */
  get canRun(): boolean {
    return this.enabled && (this.dryRun || this.token.length > 0);
  }

  /** Rev Users and links need the org and link type IDs from the workspace. */
  get canSyncRevUsers(): boolean {
    return this.syncRevUsers && this.revOrgId.length > 0;
  }

  isCohortAllowed(cohortId: string): boolean {
    return (
      this.cohortAllowlist.size === 0 || this.cohortAllowlist.has(cohortId)
    );
  }

  isAlpCohortType(type: string | null | undefined): boolean {
    return (
      this.alpCohortTypes.size === 0 ||
      this.alpCohortTypes.has((type ?? "").trim().toLowerCase())
    );
  }

  /** Problems found while reading the environment; logged once at startup. */
  readonly warnings: string[] = [];
  /** Settings rejected at startup; logged as errors. The setting is treated as unset. */
  readonly errors: string[] = [];

  /**
   * Reads a link type ID and rejects anything that isn't a custom_link_type
   * DON. A schema ID (tenant_fragment/...) or a pasted "KEY=value" here is
   * what made links.create fail with unexpected_id_type.
   */
  private linkTypeId(key: string, get: (key: string) => string): string {
    const value = get(key);
    if (!value) return "";
    if (!LINK_TYPE_ID.test(value)) {
      this.errors.push(
        `${key} is not a custom_link_type ID (expected don:core:...:custom_link_type/<n>); these links will not sync`
      );
      return "";
    }
    if (DEPRECATED_LINK_TYPE_IDS.has(value)) {
      this.errors.push(
        `${key} is a deprecated link type (${value}); these links will not sync`
      );
      return "";
    }
    return value;
  }

  private parseFieldMap(raw: string): Record<string, string> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through to the warning below
    }
    this.warnings.push(
      "DEVREV_PROFILE_FIELD_MAP is not a JSON object; custom profile fields will not sync"
    );
    return {};
  }
}
