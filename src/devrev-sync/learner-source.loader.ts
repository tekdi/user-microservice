import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { STUDENT_ROLE_CODE } from "../common/utils/roles.constants";
import { DevRevSyncConfig } from "./devrev-sync.config";
import { EnrollmentSource, LearnerSource } from "./learner-payloads";

export interface LearnerSnapshot {
  learner: LearnerSource;
  isStudent: boolean;
  /** ALP memberships allowed by config, newest first. */
  enrollments: EnrollmentSource[];
}

/**
 * Reads everything one learner's DevRev records are built from, in a few
 * plain SQL queries (same style as PostgresUserService.getRoleCodes).
 */
@Injectable()
export class LearnerSourceLoader {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: DevRevSyncConfig
  ) {}

  /** null when the user no longer exists. */
  async load(userId: string): Promise<LearnerSnapshot | null> {
    const [user] = await this.dataSource.query(
      // dob is a DATE: read as text so pg doesn't turn it into a local-midnight Date
      `SELECT "userId", "firstName", "middleName", "lastName", "email", "gender",
              "dob"::text AS "dob", "currentCountry", "createdAt", "temporaryPassword", "auto_tags"
         FROM public."Users"
        WHERE "userId" = $1`,
      [userId]
    );
    if (!user) return null;

    const [roles, memberships] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT LOWER(TRIM(R.code)) AS "roleCode"
           FROM public."UserTenantMapping" UTM
           JOIN public."UserRolesMapping" URM
             ON URM."userId" = UTM."userId" AND URM."tenantId" = UTM."tenantId"
           JOIN public."Roles" R ON R."roleId" = URM."roleId"
          WHERE UTM."userId" = $1`,
        [userId]
      ),
      this.dataSource.query(
        `SELECT CM."cohortMembershipId", CM."cohortId", CM."status", CM."createdAt",
                CM."updatedAt", CM.user_cohort_country_id AS "countryId",
                C."name" AS "cohortName", C."type" AS "cohortType"
           FROM public."CohortMembers" CM
           JOIN public."Cohort" C ON C."cohortId" = CM."cohortId"
          WHERE CM."userId" = $1
          ORDER BY CM."createdAt" DESC`,
        [userId]
      ),
    ]);

    const alpMemberships = (memberships as any[]).filter(
      (m) =>
        m.cohortName &&
        this.config.isAlpCohortType(m.cohortType) &&
        this.config.isCohortAllowed(m.cohortId)
    );

    const latestCountryId = alpMemberships.find((m) => m.countryId)?.countryId;
    const [applicationCountry, customFields] = await Promise.all([
      latestCountryId ? this.countryName(latestCountryId) : null,
      this.customFields(
        userId,
        alpMemberships.map((m) => m.cohortMembershipId)
      ),
    ]);

    return {
      isStudent: (roles as any[]).some((r) => r.roleCode === STUDENT_ROLE_CODE),
      learner: {
        userId: user.userId,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        gender: user.gender,
        dob: user.dob,
        currentCountry: user.currentCountry,
        createdAt: user.createdAt,
        temporaryPassword: user.temporaryPassword,
        autoTags: user.auto_tags,
        applicationCountry,
        customFields,
      },
      enrollments: alpMemberships.map((m, index) => ({
        cohortId: m.cohortId,
        cohortName: m.cohortName,
        status: m.status,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        isLatest: index === 0,
      })),
    };
  }

  /** Learners with a membership in this cohort, for backfill and re-sync. */
  async userIdsInCohort(cohortId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT "userId" FROM public."CohortMembers" WHERE "cohortId" = $1`,
      [cohortId]
    );
    return (rows as any[]).map((r) => r.userId);
  }

  private async countryName(countryId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT "name" FROM public."countries" WHERE "id" = $1`,
      [countryId]
    );
    return row?.name ?? null;
  }

  /**
   * Values for the fields in DEVREV_PROFILE_FIELD_MAP. Application answers are
   * stored against the user or the membership, so both are read; the most
   * recently updated value wins.
   */
  private async customFields(
    userId: string,
    membershipIds: string[]
  ): Promise<Record<string, string | null>> {
    const fieldIds = Object.keys(this.config.profileFieldMap);
    if (fieldIds.length === 0) return {};

    const rows = await this.dataSource.query(
      `SELECT "fieldId", "value"
         FROM public."FieldValues"
        WHERE "itemId" = ANY($1::uuid[]) AND "fieldId" = ANY($2::uuid[])
        ORDER BY "updatedAt" ASC NULLS FIRST`,
      [[userId, ...membershipIds], fieldIds]
    );
    const values: Record<string, string | null> = {};
    for (const row of rows as any[]) {
      values[this.config.profileFieldMap[row.fieldId]] = row.value;
    }
    return values;
  }
}
