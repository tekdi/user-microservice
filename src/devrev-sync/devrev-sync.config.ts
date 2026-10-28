import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
    this.token = get("DEVREV_TOKEN");
    this.revOrgId = get("DEVREV_REV_ORG_ID");
    this.profileLinkTypeId = get("DEVREV_LINK_TYPE_PROFILE_ID");
    this.recordLinkTypeId = get("DEVREV_LINK_TYPE_RECORD_ID");

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
