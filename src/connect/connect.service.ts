import * as crypto from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { CacheService } from "src/cache/cache.service";
import { ConnectProfile } from "./entities/connect-profile.entity";
import { ConnectCareerDomain } from "./entities/connect-career-domain.entity";
import { ConnectCareerDomainGroup } from "./entities/connect-career-domain-group.entity";
import { SupportOfferingType } from "./entities/support-offering-type.entity";
import {
  CONNECT_CACHE,
  CONNECT_CURRENT_STATUSES,
  CONNECT_ERRORS,
  CONNECT_LIMITS,
  CONNECT_REPORT_REASONS,
  ConnectLinkedinVisit,
  ConnectListSort,
  ConnectProfileStatus,
  LINKEDIN_PROFILE_REGEX,
} from "./constants/connect.constants";
import { ConnectEnrichmentService } from "./connect-enrichment.service";
import { JoinConnectDto } from "./dto/join-connect.dto";
import { UpdateConnectProfileDto } from "./dto/update-connect-profile.dto";
import { ConnectListDto } from "./dto/connect-list.dto";
import { LinkedinClickDto } from "./dto/linkedin-click.dto";

type ConnectError = { code: string; message: string };

/** All career domain groups, domains and "Open to" options (active + inactive), cached together */
interface ConnectMasters {
  groups: Pick<ConnectCareerDomainGroup, "id" | "key" | "name" | "isActive">[];
  domains: Pick<ConnectCareerDomain, "id" | "name" | "groupId" | "isActive">[];
  openTo: Pick<SupportOfferingType, "id" | "label" | "isActive">[];
}

type CareerDomainView = {
  id: string;
  name: string;
  groupId: string;
  groupKey: string;
  group: string;
};

/** Profile-modal data that is the same for every viewer (cached) */
interface ConnectProfileView {
  userId: string;
  name: string;
  initials: string;
  location: string | null;
  countryCode: string | null;
  pathway: { id: string; name: string } | null;
  cohort: { id: string; name: string } | null;
  headline: string;
  careerDomain: CareerDomainView | null;
  currentStatus: { key: string; label: string } | null;
  openTo: { id: string; label: string }[];
  about: string | null;
  linkedinUrl: string;
}

@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    @InjectRepository(ConnectProfile)
    private readonly profileRepository: Repository<ConnectProfile>,
    @InjectRepository(ConnectCareerDomain)
    private readonly careerDomainRepository: Repository<ConnectCareerDomain>,
    @InjectRepository(ConnectCareerDomainGroup)
    private readonly groupRepository: Repository<ConnectCareerDomainGroup>,
    @InjectRepository(SupportOfferingType)
    private readonly supportOfferingRepository: Repository<SupportOfferingType>,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly enrichmentService: ConnectEnrichmentService
  ) {}

  // ---------------------------------------------------------------------
  // A1. GET /connect/me
  // ---------------------------------------------------------------------
  async getMe(userId: string, tenantId: string, response: Response) {
    const apiId = APIID.CONNECT_ME;
    try {
      const [profile, details, masters] = await Promise.all([
        this.profileRepository.findOne({ where: { userId } }),
        this.enrichmentService.getUserDetails([userId], tenantId),
        this.getMasters(),
      ]);
      const me = details.get(userId);
      const pastPathway = await this.enrichmentService.getPastPathway(
        userId,
        me?.pathway?.id ?? null
      );

      const status = profile?.status ?? null;
      const result = {
        isMember: status === ConnectProfileStatus.ACTIVE,
        status,
        termsAcceptedAt: profile?.termsAcceptedAt ?? null,
        journey: {
          name: me?.name ?? null,
          initials: me?.initials ?? null,
          currentPathway: me?.pathway ?? null,
          pastPathway,
          cohort: me?.cohort ?? null,
          location: me?.location ?? null,
          countryCode: me?.countryCode ?? null,
        },
        // kept after Leave so the join form can be prefilled
        profile:
          profile && status !== ConnectProfileStatus.SUSPENDED
            ? this.toOwnProfile(profile, masters)
            : null,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.CONNECT_ME_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "getMe", error, userId);
    }
  }

  // ---------------------------------------------------------------------
  // A2. GET /connect/options
  // ---------------------------------------------------------------------
  async getOptions(tenantId: string, response: Response) {
    const apiId = APIID.CONNECT_OPTIONS;
    try {
      const [masters, countries] = await Promise.all([
        this.getMasters(),
        this.getMemberCountries(),
      ]);

      // active groups with their active domains, in displayOrder
      // (masters are already sorted); empty groups are left out
      const careerDomains = masters.groups
        .filter((g) => g.isActive)
        .map((g) => {
          const domains = masters.domains
            .filter((d) => d.isActive && d.groupId === g.id)
            .map((d) => ({ id: d.id, name: d.name }));
          return {
            groupId: g.id,
            groupKey: g.key,
            group: g.name,
            domainCount: domains.length,
            domains,
          };
        })
        .filter((g) => g.domainCount > 0);

      const result = {
        careerDomains,
        openTo: masters.openTo
          .filter((o) => o.isActive)
          .map((o) => ({ id: o.id, label: o.label })),
        // Country filter: only countries that have Connect members
        countries,
        currentStatuses: CONNECT_CURRENT_STATUSES,
        reportReasons: CONNECT_REPORT_REASONS,
      };
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.CONNECT_OPTIONS_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "getOptions", error);
    }
  }

  // ---------------------------------------------------------------------
  // A3. POST /connect/join  (first join and re-join after Leave)
  // ---------------------------------------------------------------------
  async join(
    userId: string,
    tenantId: string,
    dto: JoinConnectDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_JOIN;
    try {
      const masters = await this.getMasters();
      const invalid = this.validateProfileFields(dto, masters, true);
      if (invalid) {
        return this.fail(response, apiId, invalid, HttpStatus.BAD_REQUEST);
      }

      // One statement for join and re-join. A suspended row is never touched,
      // so RETURNING gives no row for a suspended user.
      const rows = await this.dataSource.query(
        `INSERT INTO connect_profiles
           ("userId", "status", "termsAcceptedAt", "headline", "linkedinUrl",
            "careerDomainId", "currentStatus", "openToIds", "about", "joinedAt")
         VALUES ($1, 'ACTIVE', now(), $2, $3, $4, $5, $6::uuid[], $7, now())
         ON CONFLICT ("userId") DO UPDATE SET
           "status" = 'ACTIVE',
           "termsAcceptedAt" = now(),
           "headline" = EXCLUDED."headline",
           "linkedinUrl" = EXCLUDED."linkedinUrl",
           "careerDomainId" = EXCLUDED."careerDomainId",
           "currentStatus" = EXCLUDED."currentStatus",
           "openToIds" = EXCLUDED."openToIds",
           "about" = EXCLUDED."about",
           "joinedAt" = now(),
           "leftAt" = NULL,
           "updatedAt" = now()
         WHERE connect_profiles."status" <> 'SUSPENDED'
         RETURNING *`,
        [
          userId,
          dto.headline,
          this.normaliseLinkedinUrl(dto.linkedinUrl),
          dto.careerDomainId,
          dto.currentStatus,
          dto.openToIds,
          dto.about || null,
        ]
      );
      if (!rows.length) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.SUSPENDED,
          HttpStatus.FORBIDDEN
        );
      }

      await this.clearMemberCaches(userId);

      const result = {
        isMember: true,
        status: ConnectProfileStatus.ACTIVE,
        profile: this.toOwnProfile(rows[0], masters),
      };
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_JOIN_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "join", error, userId);
    }
  }

  // ---------------------------------------------------------------------
  // A4. POST /connect/list
  // ---------------------------------------------------------------------
  async list(
    viewerId: string,
    tenantId: string,
    dto: ConnectListDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_LIST;
    try {
      const denied = await this.checkActiveMember(viewerId);
      if (denied) {
        return this.fail(response, apiId, denied.error, denied.status);
      }

      const masters = await this.getMasters();
      const filters = dto.filters ?? {};

      // Career domain: up to 2 picks (groups + sub-domains together).
      // Groups are turned into their sub-domain ids here, so the query only
      // filters connect_profiles."careerDomainId".
      const groupIds = [...new Set(filters.careerDomainGroupIds ?? [])];
      const pickedDomainIds = [...new Set(filters.careerDomainIds ?? [])];
      const knownGroups = new Set(masters.groups.map((g) => g.id));
      const knownDomains = new Set(masters.domains.map((d) => d.id));
      if (
        groupIds.length + pickedDomainIds.length >
          CONNECT_LIMITS.CAREER_DOMAIN_FILTER_MAX ||
        groupIds.some((id) => !knownGroups.has(id)) ||
        pickedDomainIds.some((id) => !knownDomains.has(id))
      ) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.INVALID_FILTER,
          HttpStatus.BAD_REQUEST
        );
      }
      const domainIds = new Set(pickedDomainIds);
      for (const d of masters.domains) {
        if (groupIds.includes(d.groupId)) domainIds.add(d.id);
      }

      const page = dto.page ?? 1;
      const limit = dto.limit ?? CONNECT_LIMITS.LIST_DEFAULT_LIMIT;
      const sort = dto.sort ?? ConnectListSort.SAME_COHORT;
      const seed =
        dto.seed || crypto.randomBytes(4).toString("hex").slice(0, 6);
      // every word must match (AND), e.g. "C1 2023" or "ghana kumasi"
      const searchWords =
        dto.search && dto.search.length >= CONNECT_LIMITS.SEARCH_MIN_CHARS
          ? [
              ...new Set(dto.search.toLowerCase().split(/\s+/).filter(Boolean)),
            ].slice(0, CONNECT_LIMITS.SEARCH_MAX_WORDS)
          : [];

      // ---- WHERE (only the filters that were sent) ----
      // Users / FieldValues / CohortMembers are read live (no copy table)
      const params: any[] = [viewerId];
      const where: string[] = [
        `cp."status" = 'ACTIVE'`,
        `cp."userId" <> $1`,
        `u."status" <> 'archived'`,
      ];
      if (groupIds.length || pickedDomainIds.length) {
        params.push([...domainIds]);
        where.push(`cp."careerDomainId" = ANY($${params.length}::uuid[])`);
      }
      if (filters.openToIds?.length) {
        params.push([...new Set(filters.openToIds)]);
        // any of the selected options (GIN index on openToIds)
        where.push(`cp."openToIds" && $${params.length}::uuid[]`);
      }
      if (filters.currentStatus) {
        params.push(filters.currentStatus);
        where.push(`cp."currentStatus" = $${params.length}`);
      }
      if (filters.country) {
        params.push(filters.country);
        where.push(`TRIM(u."currentCountry") = $${params.length}`);
      }
      if (filters.linkedinVisit === ConnectLinkedinVisit.VISITED) {
        where.push(
          `EXISTS (SELECT 1 FROM connect_linkedin_clicks lc WHERE lc."viewerUserId" = $1 AND lc."targetUserId" = cp."userId")`
        );
      } else if (filters.linkedinVisit === ConnectLinkedinVisit.NOT_VISITED) {
        where.push(
          `NOT EXISTS (SELECT 1 FROM connect_linkedin_clicks lc WHERE lc."viewerUserId" = $1 AND lc."targetUserId" = cp."userId")`
        );
      } else if (filters.linkedinVisit === ConnectLinkedinVisit.REPORTED) {
        where.push(
          `EXISTS (SELECT 1 FROM safety_reports sr WHERE sr."reporterUserId" = $1 AND sr."reportedUserId" = cp."userId")`
        );
      }
      if (searchWords.length) {
        const locationFieldIds =
          await this.enrichmentService.getLocationFieldIds(tenantId);
        for (const word of searchWords) {
          where.push(
            await this.searchCondition(word, params, tenantId, locationFieldIds)
          );
        }
      }

      const fromWhere = `FROM connect_profiles cp
        JOIN "Users" u ON u."userId" = cp."userId"
        WHERE ${where.join(" AND ")}`;

      // ---- total (cached briefly; depends on viewer through self + visited/reported) ----
      const countKey = CONNECT_CACHE.COUNT_KEY(
        crypto
          .createHash("sha256")
          .update(JSON.stringify({ viewerId, params }))
          .digest("hex")
      );
      let totalCount = await this.cacheService.get<number>(countKey);
      if (totalCount === null) {
        const [{ count }] = await this.dataSource.query(
          `SELECT count(*)::int AS count ${fromWhere}`,
          params
        );
        totalCount = count;
        await this.safeCacheSet(countKey, totalCount, CONNECT_CACHE.COUNT_TTL);
      }

      // ---- step 1: ids of the requested page ----
      const pageParams = [...params];
      let pageFromWhere = fromWhere;
      let orderBy: string;
      if (sort === ConnectListSort.NAME_ASC) {
        orderBy = `lower(u."firstName"), lower(u."lastName"), cp."userId"`;
      } else {
        // same seed = same order on every page; hashtext is cheaper than md5
        pageParams.push(seed);
        const shuffle = `hashtext(cp."userId"::text || $${pageParams.length}), cp."userId"`;
        if (sort === ConnectListSort.NEWEST_COHORT) {
          // latest completed cohort start per member, grouped once (not per row)
          pageFromWhere = `FROM connect_profiles cp
        JOIN "Users" u ON u."userId" = cp."userId"
        LEFT JOIN (SELECT cm."userId", max(c."cohort_startDate") AS "latestStart"
                     FROM "CohortMembers" cm
                     JOIN "Cohort" c ON c."cohortId" = cm."cohortId"
                    WHERE cm."cohortCoursesCompleted"
                    GROUP BY cm."userId") lc ON lc."userId" = cp."userId"
        WHERE ${where.join(" AND ")}`;
          orderBy = `lc."latestStart" DESC NULLS LAST, ${shuffle}`;
        } else {
          const viewerCohortIds = await this.getCompletedCohortIds(viewerId);
          if (viewerCohortIds.length) {
            pageParams.push(viewerCohortIds);
            orderBy = `(cp."userId" IN (SELECT cm."userId" FROM "CohortMembers" cm
                          WHERE cm."cohortId" = ANY($${pageParams.length}::uuid[])
                            AND cm."cohortCoursesCompleted")) DESC, ${shuffle}`;
          } else {
            orderBy = shuffle;
          }
        }
      }
      pageParams.push(limit, (page - 1) * limit);
      const rows: ConnectProfile[] = await this.dataSource.query(
        `SELECT cp."userId", cp."headline", cp."careerDomainId", cp."currentStatus", cp."openToIds"
         ${pageFromWhere}
         ORDER BY ${orderBy}
         LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams
      );

      // ---- step 2: enrich only this page ----
      const ids = rows.map((r) => r.userId);
      const [details, visited] = await Promise.all([
        this.enrichmentService.getUserDetails(ids, tenantId),
        this.getVisitedTargets(viewerId, ids),
      ]);

      const items = rows.map((r) => {
        const d = details.get(r.userId);
        return {
          userId: r.userId,
          name: d?.name ?? null,
          initials: d?.initials ?? null,
          location: d?.location ?? null,
          countryCode: d?.countryCode ?? null,
          cohort: d?.cohort ? { id: d.cohort.id, name: d.cohort.name } : null,
          pathway: d?.pathway ?? null,
          headline: r.headline,
          careerDomain: this.toCareerDomain(r.careerDomainId, masters),
          currentStatus: this.toCurrentStatus(r.currentStatus),
          openTo: this.toOpenTo(r.openToIds, masters),
          linkedinVisited: visited.has(r.userId),
        };
      });

      const result = {
        items,
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        seed,
      };
      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.CONNECT_LIST_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "list", error, viewerId);
    }
  }

  // ---------------------------------------------------------------------
  // A5. GET /connect/profile/:userId
  // ---------------------------------------------------------------------
  async getProfile(
    viewerId: string,
    tenantId: string,
    targetUserId: string,
    response: Response
  ) {
    const apiId = APIID.CONNECT_PROFILE_READ;
    try {
      const denied = await this.checkActiveMember(viewerId);
      if (denied) {
        return this.fail(response, apiId, denied.error, denied.status);
      }

      const view = await this.getProfileView(targetUserId, tenantId);
      if (!view) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.PROFILE_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      const visited = await this.getVisitedTargets(viewerId, [targetUserId]);

      return APIResponse.success(
        response,
        apiId,
        { ...view, linkedinVisited: visited.has(targetUserId) },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_PROFILE_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "getProfile", error, viewerId);
    }
  }

  // ---------------------------------------------------------------------
  // A6. POST /connect/profile/:userId/linkedin-click
  // ---------------------------------------------------------------------
  async trackLinkedinClick(
    viewerId: string,
    tenantId: string,
    targetUserId: string,
    dto: LinkedinClickDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_LINKEDIN_CLICK;
    try {
      const denied = await this.checkActiveMember(viewerId);
      if (denied) {
        return this.fail(response, apiId, denied.error, denied.status);
      }
      if (viewerId === targetUserId) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.SELF_ACTION,
          HttpStatus.BAD_REQUEST
        );
      }
      if (
        (await this.getMemberStatus(targetUserId)) !==
        ConnectProfileStatus.ACTIVE
      ) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.PROFILE_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }

      // only the first click per pair is stored; repeats change nothing
      const inserted = await this.dataSource.query(
        `INSERT INTO connect_linkedin_clicks ("viewerUserId", "targetUserId")
         VALUES ($1, $2)
         ON CONFLICT ("viewerUserId", "targetUserId") DO NOTHING
         RETURNING "clickedAt"`,
        [viewerId, targetUserId]
      );

      LoggerUtil.log(
        `LinkedIn click ${viewerId} -> ${targetUserId} (${
          dto.source ?? "unknown"
        })`,
        "ConnectService",
        viewerId
      );
      return APIResponse.success(
        response,
        apiId,
        {
          tracked: true,
          linkedinVisited: true,
          firstVisit: inserted.length > 0,
        },
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_LINKEDIN_CLICK_SUCCESS
      );
    } catch (error) {
      return this.internalError(
        response,
        apiId,
        "trackLinkedinClick",
        error,
        viewerId
      );
    }
  }

  // ---------------------------------------------------------------------
  // A8. PATCH /connect/me
  // ---------------------------------------------------------------------
  async updateMe(
    userId: string,
    tenantId: string,
    dto: UpdateConnectProfileDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_PROFILE_UPDATE;
    try {
      const denied = await this.checkActiveMember(userId);
      if (denied) {
        return this.fail(response, apiId, denied.error, denied.status);
      }

      const fields = [
        "headline",
        "linkedinUrl",
        "careerDomainId",
        "currentStatus",
        "openToIds",
        "about",
      ] as const;
      const sent = fields.filter((f) => dto[f] !== undefined);
      if (!sent.length) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.NOTHING_TO_UPDATE,
          HttpStatus.BAD_REQUEST
        );
      }
      // only "about" can be cleared; the rest are required on the profile
      const required = [
        "headline",
        "linkedinUrl",
        "careerDomainId",
        "currentStatus",
        "openToIds",
      ] as const;
      if (required.some((f) => dto[f] === null || dto[f] === "")) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.REQUIRED_FIELD,
          HttpStatus.BAD_REQUEST
        );
      }

      const masters = await this.getMasters();
      const invalid = this.validateProfileFields(dto, masters, false);
      if (invalid) {
        return this.fail(response, apiId, invalid, HttpStatus.BAD_REQUEST);
      }

      const patch: Partial<ConnectProfile> = {};
      for (const f of sent) {
        (patch as any)[f] = dto[f] === "" ? null : dto[f];
      }
      if (patch.linkedinUrl) {
        patch.linkedinUrl = this.normaliseLinkedinUrl(patch.linkedinUrl);
      }

      await this.profileRepository.update(
        { userId, status: ConnectProfileStatus.ACTIVE },
        patch
      );
      const profile = await this.profileRepository.findOne({
        where: { userId },
      });
      await this.cacheService.del(CONNECT_CACHE.PROFILE_KEY(userId));

      return APIResponse.success(
        response,
        apiId,
        { profile: this.toOwnProfile(profile, masters) },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_PROFILE_UPDATED
      );
    } catch (error) {
      return this.internalError(response, apiId, "updateMe", error, userId);
    }
  }

  // ---------------------------------------------------------------------
  // A9. PATCH /connect/me/leave
  // ---------------------------------------------------------------------
  async leave(userId: string, tenantId: string, response: Response) {
    const apiId = APIID.CONNECT_LEAVE;
    try {
      const rows = await this.dataSource.query(
        `UPDATE connect_profiles
            SET "status" = 'LEFT', "leftAt" = now(), "updatedAt" = now()
          WHERE "userId" = $1 AND "status" = 'ACTIVE'
          RETURNING "leftAt"`,
        [userId]
      );
      if (!rows.length) {
        return this.fail(
          response,
          apiId,
          CONNECT_ERRORS.NOT_A_MEMBER,
          HttpStatus.FORBIDDEN
        );
      }
      await this.clearMemberCaches(userId);

      return APIResponse.success(
        response,
        apiId,
        {
          isMember: false,
          status: ConnectProfileStatus.LEFT,
          leftAt: rows[0].leftAt,
        },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_LEAVE_SUCCESS
      );
    } catch (error) {
      return this.internalError(response, apiId, "leave", error, userId);
    }
  }

  // =====================================================================
  // Shared helpers (also used by SafetyReportService)
  // =====================================================================

  /** Profile status of a user, or null if they never joined (cached) */
  async getMemberStatus(userId: string): Promise<ConnectProfileStatus | null> {
    const key = CONNECT_CACHE.MEMBER_KEY(userId);
    const cached = await this.cacheService.get<{
      status: ConnectProfileStatus | null;
    }>(key);
    if (cached) return cached.status;

    const profile = await this.profileRepository.findOne({
      where: { userId },
      select: ["id", "status"],
    });
    const status = profile?.status ?? null;
    await this.safeCacheSet(key, { status }, CONNECT_CACHE.MEMBER_TTL);
    return status;
  }

  /** null when the caller may use member-only APIs, otherwise the error to send */
  async checkActiveMember(
    userId: string
  ): Promise<{ error: ConnectError; status: HttpStatus } | null> {
    const status = await this.getMemberStatus(userId);
    if (status === ConnectProfileStatus.SUSPENDED) {
      return { error: CONNECT_ERRORS.SUSPENDED, status: HttpStatus.FORBIDDEN };
    }
    if (status !== ConnectProfileStatus.ACTIVE) {
      return {
        error: CONNECT_ERRORS.NOT_A_MEMBER,
        status: HttpStatus.FORBIDDEN,
      };
    }
    return null;
  }

  fail(
    response: Response,
    apiId: string,
    error: ConnectError,
    status: HttpStatus
  ) {
    return APIResponse.error(
      response,
      apiId,
      error.code,
      error.message,
      status
    );
  }

  internalError(
    response: Response,
    apiId: string,
    method: string,
    error: any,
    userId?: string
  ) {
    LoggerUtil.error(
      API_RESPONSES.SERVER_ERROR,
      `ConnectService.${method}: ${error?.message}`,
      apiId,
      userId
    );
    return APIResponse.error(
      response,
      apiId,
      API_RESPONSES.INTERNAL_SERVER_ERROR,
      API_RESPONSES.SERVER_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  async safeCacheSet(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.cacheService.set(key, value, ttl);
    } catch (error) {
      this.logger.warn(`Failed to cache ${key}: ${error?.message}`);
    }
  }

  // =====================================================================
  // Private helpers
  // =====================================================================

  private async getMasters(): Promise<ConnectMasters> {
    const cached = await this.cacheService.get<ConnectMasters>(
      CONNECT_CACHE.OPTIONS_KEY
    );
    if (cached) return cached;

    const [groups, domains, openTo] = await Promise.all([
      this.groupRepository.find({
        select: ["id", "key", "name", "isActive"],
        order: { displayOrder: "ASC", name: "ASC" },
      }),
      this.careerDomainRepository.find({
        select: ["id", "name", "groupId", "isActive"],
        order: { displayOrder: "ASC", name: "ASC" },
      }),
      this.supportOfferingRepository.find({
        select: ["id", "label", "isActive"],
        order: { displayOrder: "ASC", label: "ASC" },
      }),
    ]);
    const masters = { groups, domains, openTo };
    await this.safeCacheSet(
      CONNECT_CACHE.OPTIONS_KEY,
      masters,
      CONNECT_CACHE.OPTIONS_TTL
    );
    return masters;
  }

  /**
   * Checks values the DTO can't: selected ids are active, About word count.
   * On join every rule applies; on edit only to the fields sent.
   */
  private validateProfileFields(
    dto: Partial<JoinConnectDto>,
    masters: ConnectMasters,
    isJoin: boolean
  ): ConnectError | null {
    if (
      (isJoin || dto.linkedinUrl !== undefined) &&
      !LINKEDIN_PROFILE_REGEX.test(dto.linkedinUrl ?? "")
    ) {
      return CONNECT_ERRORS.INVALID_LINKEDIN_URL;
    }
    const activeGroups = new Set(
      masters.groups.filter((g) => g.isActive).map((g) => g.id)
    );
    if (
      dto.careerDomainId &&
      !masters.domains.some(
        (d) =>
          d.id === dto.careerDomainId &&
          d.isActive &&
          activeGroups.has(d.groupId)
      )
    ) {
      return CONNECT_ERRORS.INVALID_OPTION;
    }
    if (
      dto.openToIds?.some(
        (id) => !masters.openTo.some((o) => o.id === id && o.isActive)
      )
    ) {
      return CONNECT_ERRORS.INVALID_OPTION;
    }
    if (
      dto.about &&
      dto.about.split(/\s+/).filter(Boolean).length >
        CONNECT_LIMITS.ABOUT_MAX_WORDS
    ) {
      return CONNECT_ERRORS.ABOUT_TOO_LONG;
    }
    return null;
  }

  /** Stored form: https://www.linkedin.com/in/<handle> */
  private normaliseLinkedinUrl(url: string): string {
    const handle = LINKEDIN_PROFILE_REGEX.exec(url.trim())[3];
    return `https://www.linkedin.com/in/${handle}`;
  }

  private toOwnProfile(profile: ConnectProfile, masters: ConnectMasters) {
    return {
      headline: profile.headline,
      linkedinUrl: profile.linkedinUrl,
      careerDomain: this.toCareerDomain(profile.careerDomainId, masters),
      currentStatus: this.toCurrentStatus(profile.currentStatus),
      openTo: this.toOpenTo(profile.openToIds, masters),
      about: profile.about,
      updatedAt: profile.updatedAt,
    };
  }

  private toCareerDomain(
    id: string | null,
    masters: ConnectMasters
  ): CareerDomainView | null {
    const d = id ? masters.domains.find((x) => x.id === id) : null;
    if (!d) return null;
    const g = masters.groups.find((x) => x.id === d.groupId);
    return {
      id: d.id,
      name: d.name,
      groupId: d.groupId,
      groupKey: g?.key ?? null,
      group: g?.name ?? null,
    };
  }

  /** ids → [{ id, label }] in the master display order */
  private toOpenTo(ids: string[] | null, masters: ConnectMasters) {
    if (!ids?.length) return [];
    return masters.openTo
      .filter((o) => ids.includes(o.id))
      .map((o) => ({ id: o.id, label: o.label }));
  }

  /** Countries that have ACTIVE Connect members, for the Country filter (cached) */
  private async getMemberCountries(): Promise<
    { name: string; code: string | null; memberCount: number }[]
  > {
    const cached = await this.cacheService.get<
      { name: string; code: string | null; memberCount: number }[]
    >(CONNECT_CACHE.COUNTRIES_KEY);
    if (cached) return cached;

    const [rows, codes] = await Promise.all([
      this.dataSource.query(
        `SELECT TRIM(u."currentCountry") AS name, count(*)::int AS "memberCount"
           FROM connect_profiles cp
           JOIN "Users" u ON u."userId" = cp."userId"
          WHERE cp."status" = 'ACTIVE' AND u."status" <> 'archived'
            AND NULLIF(TRIM(u."currentCountry"), '') IS NOT NULL
          GROUP BY 1
          ORDER BY 1`
      ),
      this.enrichmentService.getCountryCodes(),
    ]);
    const countries = rows.map((r) => ({
      name: r.name,
      code: codes[r.name.toLowerCase()] ?? null,
      memberCount: r.memberCount,
    }));
    await this.safeCacheSet(
      CONNECT_CACHE.COUNTRIES_KEY,
      countries,
      CONNECT_CACHE.COUNTRIES_TTL
    );
    return countries;
  }

  private toCurrentStatus(key: string | null) {
    const s = key ? CONNECT_CURRENT_STATUSES.find((x) => x.key === key) : null;
    return s ? { key: s.key, label: s.label } : null;
  }

  /** Modal data for an ACTIVE member, without viewer-specific flags (cached) */
  private async getProfileView(
    userId: string,
    tenantId: string
  ): Promise<ConnectProfileView | null> {
    const key = CONNECT_CACHE.PROFILE_KEY(userId);
    const cached = await this.cacheService.get<ConnectProfileView>(key);
    if (cached) return cached;

    const profile = await this.profileRepository.findOne({
      where: { userId, status: ConnectProfileStatus.ACTIVE },
    });
    if (!profile) return null;

    const [details, masters] = await Promise.all([
      this.enrichmentService.getUserDetails([userId], tenantId),
      this.getMasters(),
    ]);
    const d = details.get(userId);
    const view: ConnectProfileView = {
      userId,
      name: d?.name ?? null,
      initials: d?.initials ?? null,
      location: d?.location ?? null,
      countryCode: d?.countryCode ?? null,
      pathway: d?.pathway ?? null,
      cohort: d?.cohort ? { id: d.cohort.id, name: d.cohort.name } : null,
      headline: profile.headline,
      careerDomain: this.toCareerDomain(profile.careerDomainId, masters),
      currentStatus: this.toCurrentStatus(profile.currentStatus),
      openTo: this.toOpenTo(profile.openToIds, masters),
      about: profile.about,
      linkedinUrl: profile.linkedinUrl,
    };
    await this.safeCacheSet(key, view, CONNECT_CACHE.PROFILE_TTL);
    return view;
  }

  /**
   * One search word: matches name, country, headline, about, city / state
   * (FieldValues) or a completed cohort whose name or start year contains it.
   * Matching cohorts are looked up first (Cohort is small). The FieldValues /
   * CohortMembers checks are per-member EXISTS on their (itemId / userId)
   * indexes: an IN (...) list can be too big to hash and then gets re-scanned
   * for every member.
   */
  private async searchCondition(
    word: string,
    params: any[],
    tenantId: string,
    locationFieldIds: string[]
  ): Promise<string> {
    const pattern = `%${word.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    params.push(pattern);
    const term = `$${params.length}`;
    const parts = [
      `cp."headline" ILIKE ${term}`,
      `cp."about" ILIKE ${term}`,
      `(u."firstName" || ' ' || COALESCE(u."lastName", '')) ILIKE ${term}`,
      `u."currentCountry" ILIKE ${term}`,
    ];
    if (locationFieldIds.length) {
      params.push(locationFieldIds);
      parts.push(
        `EXISTS (SELECT 1 FROM "FieldValues" fv
            WHERE fv."itemId" = cp."userId"
              AND fv."fieldId" = ANY($${params.length}::uuid[])
              AND COALESCE(fv."textValue", fv."value") ILIKE ${term})`
      );
    }
    const cohorts = await this.dataSource.query(
      `SELECT "cohortId" FROM "Cohort"
        WHERE "tenantId" = $1
          AND (name ILIKE $2 OR extract(year FROM "cohort_startDate")::text LIKE $2)`,
      [tenantId, pattern]
    );
    if (cohorts.length) {
      params.push(cohorts.map((c) => c.cohortId));
      parts.push(
        `EXISTS (SELECT 1 FROM "CohortMembers" cm
            WHERE cm."userId" = cp."userId"
              AND cm."cohortId" = ANY($${params.length}::uuid[])
              AND cm."cohortCoursesCompleted")`
      );
    }
    return `(${parts.join(" OR ")})`;
  }

  /**
   * Cohorts the viewer completed (CohortMembers.cohortCoursesCompleted,
   * set by the certificate flow), for the "same cohort first" sort
   */
  private async getCompletedCohortIds(userId: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT "cohortId" FROM "CohortMembers"
        WHERE "userId" = $1 AND "cohortCoursesCompleted"`,
      [userId]
    );
    return rows.map((r) => r.cohortId);
  }

  private async getVisitedTargets(
    viewerId: string,
    targetIds: string[]
  ): Promise<Set<string>> {
    if (!targetIds.length) return new Set();
    const rows = await this.dataSource.query(
      `SELECT "targetUserId" FROM connect_linkedin_clicks
        WHERE "viewerUserId" = $1 AND "targetUserId" = ANY($2::uuid[])`,
      [viewerId, targetIds]
    );
    return new Set(rows.map((r) => r.targetUserId));
  }

  /**
   * Count caches (connect:count:*) are not cleared here: they are per viewer
   * and expire in 60 s, and a pattern delete uses Redis KEYS, which blocks.
   */
  private async clearMemberCaches(userId: string): Promise<void> {
    await Promise.all([
      this.cacheService.del(CONNECT_CACHE.MEMBER_KEY(userId)),
      this.cacheService.del(CONNECT_CACHE.PROFILE_KEY(userId)),
    ]);
  }
}
