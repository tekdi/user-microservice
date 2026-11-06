import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { CacheService } from "src/cache/cache.service";

export interface ConnectRef {
  id: string;
  name: string;
}

export interface ConnectCohortRef extends ConnectRef {
  year: number | null;
}

/** Live data owned by other modules (Users, FieldValues, user_pathways, CohortMembers, Cohort) */
export interface ConnectUserDetails {
  name: string;
  initials: string;
  location: string | null;
  countryCode: string | null;
  pathway: ConnectRef | null;
  cohort: ConnectCohortRef | null;
}

const COUNTRY_CODES_CACHE_KEY = "connect:countries";
const COUNTRY_CODES_CACHE_TTL = 3600;

/** Users custom fields shown as location; order = priority (city, then state) */
const LOCATION_FIELD_NAMES = [
  "current_residence_address_city",
  "current_residence_address_state",
];
const LOCATION_FIELDS_CACHE_KEY = (tenantId: string) =>
  `connect:location-fields:${tenantId}`;
const LOCATION_FIELDS_CACHE_TTL = 3600;

/**
 * Read-only batch lookups for Connect cards, profile modal and /connect/me.
 * Nothing here is copied into connect_* tables; every call reads live data,
 * one query per data source for the whole batch of user ids.
 */
@Injectable()
export class ConnectEnrichmentService {
  private readonly logger = new Logger(ConnectEnrichmentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService
  ) {}

  /** Card / modal details for many users, keyed by userId */
  async getUserDetails(
    userIds: string[],
    tenantId: string
  ): Promise<Map<string, ConnectUserDetails>> {
    const result = new Map<string, ConnectUserDetails>();
    if (!userIds.length) return result;

    const [users, places, pathways, cohorts, countryCodes] = await Promise.all([
      this.dataSource.query(
        `SELECT "userId", "firstName", "lastName", "currentCountry"
           FROM "Users" WHERE "userId" = ANY($1::uuid[])`,
        [userIds]
      ),
      this.getPlaces(userIds, tenantId),
      this.getActivePathways(userIds),
      this.getActiveCohorts(userIds, tenantId),
      this.getCountryCodes(),
    ]);

    for (const u of users) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      const country = u.currentCountry?.trim() || null;
      result.set(u.userId, {
        name,
        initials: this.toInitials(u.firstName, u.lastName),
        location:
          [places.get(u.userId), country].filter(Boolean).join(", ") || null,
        countryCode: country
          ? countryCodes[country.toLowerCase()] ?? null
          : null,
        pathway: pathways.get(u.userId) ?? null,
        cohort: cohorts.get(u.userId) ?? null,
      });
    }
    return result;
  }

  /**
   * Latest STANDARD pathway the user is no longer active in, other than the
   * current one (My profile → "Past pathway")
   */
  async getPastPathway(
    userId: string,
    currentPathwayId: string | null
  ): Promise<ConnectRef | null> {
    const rows = await this.dataSource.query(
      `SELECT p.id, p.name
         FROM user_pathways up
         JOIN pathways p ON p.id = up.pathway_id
        WHERE up.user_id = $1
          AND up.status <> 'ACTIVE'
          AND p.type = 'STANDARD'
          AND ($2::uuid IS NULL OR up.pathway_id <> $2::uuid)
        ORDER BY COALESCE(up.completed_at, up.deactivated_at, up.activated_at) DESC NULLS LAST
        LIMIT 1`,
      [userId, currentPathwayId]
    );
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  }

  /**
   * Field ids of the city / state custom fields in this tenant, looked up
   * by field name (ids differ between environments), city first
   */
  async getLocationFieldIds(tenantId: string): Promise<string[]> {
    const cacheKey = LOCATION_FIELDS_CACHE_KEY(tenantId);
    const cached = await this.cacheService.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.dataSource.query(
      `SELECT "fieldId", name FROM "Fields"
        WHERE name = ANY($1::text[]) AND "tenantId" = $2::uuid AND context = 'USERS'`,
      [LOCATION_FIELD_NAMES, tenantId]
    );
    const fieldIds = LOCATION_FIELD_NAMES.map(
      (name) => rows.find((r) => r.name === name)?.fieldId
    ).filter(Boolean);

    try {
      await this.cacheService.set(
        cacheKey,
        fieldIds,
        LOCATION_FIELDS_CACHE_TTL
      );
    } catch (error) {
      this.logger.warn(`Failed to cache location field ids: ${error?.message}`);
    }
    return fieldIds;
  }

  /** userId → city (or state when city is empty) */
  private async getPlaces(
    userIds: string[],
    tenantId: string
  ): Promise<Map<string, string>> {
    const places = new Map<string, string>();
    const locationFieldIds = await this.getLocationFieldIds(tenantId);
    if (!locationFieldIds.length) return places;

    const rows = await this.dataSource.query(
      `SELECT "itemId", "fieldId",
              NULLIF(TRIM(COALESCE("textValue", "value")), '') AS "value"
         FROM "FieldValues"
        WHERE "itemId" = ANY($1::uuid[]) AND "fieldId" = ANY($2::uuid[])`,
      [userIds, locationFieldIds]
    );
    // locationFieldIds order = priority (city before state)
    for (const fieldId of locationFieldIds) {
      for (const row of rows) {
        if (row.fieldId === fieldId && row.value && !places.has(row.itemId)) {
          places.set(row.itemId, row.value);
        }
      }
    }
    return places;
  }

  private async getActivePathways(
    userIds: string[]
  ): Promise<Map<string, ConnectRef>> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT ON (up.user_id) up.user_id AS "userId", p.id, p.name
         FROM user_pathways up
         JOIN pathways p ON p.id = up.pathway_id
        WHERE up.user_id = ANY($1::uuid[])
          AND up.status = 'ACTIVE'
          AND p.type = 'STANDARD'
        ORDER BY up.user_id, up.activated_at DESC NULLS LAST`,
      [userIds]
    );
    return new Map(rows.map((r) => [r.userId, { id: r.id, name: r.name }]));
  }

  /** Latest active cohort (by start date) in the tenant */
  private async getActiveCohorts(
    userIds: string[],
    tenantId: string
  ): Promise<Map<string, ConnectCohortRef>> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT ON (cm."userId") cm."userId", c."cohortId", c.name, c."cohort_startDate"
         FROM "CohortMembers" cm
         JOIN "Cohort" c ON c."cohortId" = cm."cohortId"
        WHERE cm."userId" = ANY($1::uuid[])
          AND cm.status = 'active'
          AND c."tenantId" = $2::uuid
        ORDER BY cm."userId", c."cohort_startDate" DESC NULLS LAST`,
      [userIds, tenantId]
    );
    return new Map(
      rows.map((r) => [
        r.userId,
        {
          id: r.cohortId,
          name: r.name,
          year: r.cohort_startDate
            ? new Date(r.cohort_startDate).getUTCFullYear()
            : null,
        },
      ])
    );
  }

  /** lower(country name) → ISO code, for the flag on cards */
  async getCountryCodes(): Promise<Record<string, string>> {
    const cached = await this.cacheService.get<Record<string, string>>(
      COUNTRY_CODES_CACHE_KEY
    );
    if (cached) return cached;

    const rows = await this.dataSource.query(
      `SELECT name, iso_code FROM countries WHERE iso_code IS NOT NULL`
    );
    const codes: Record<string, string> = {};
    for (const r of rows) codes[r.name.trim().toLowerCase()] = r.iso_code;

    try {
      await this.cacheService.set(
        COUNTRY_CODES_CACHE_KEY,
        codes,
        COUNTRY_CODES_CACHE_TTL
      );
    } catch (error) {
      this.logger.warn(`Failed to cache country codes: ${error?.message}`);
    }
    return codes;
  }

  private toInitials(firstName?: string, lastName?: string): string {
    return [firstName, lastName]
      .map((n) => (n || "").trim().charAt(0).toUpperCase())
      .join("");
  }
}
