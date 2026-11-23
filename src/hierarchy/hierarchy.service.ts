import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from 'src/cache/cache.service';

/** One group in the caller's scope, with the Learners the caller may see in it */
export interface ScopeGroup {
  cohortId: string;
  name: string;
  /** Set when this is a sub-group of a group the reviewer reviews */
  parentCohortId: string | null;
  /** 1 = a group the caller reviews; 2 = a group reviewed by one of the caller's Learners; … */
  depth: number;
  /** The Reviewer of this group through whom it is in scope (the caller at depth 1) */
  reviewerUserId: string;
  learnerUserIds: string[];
}

export interface MyScope {
  userId: string;
  tenantId: string;
  /** Admins see every user in the tenant; callers then skip the userIds check */
  all: boolean;
  groups: ScopeGroup[];
  /** Every Learner in scope, each once, never the caller */
  userIds: string[];
}

/** Redis key prefix; the subscriber clears every key under it on any membership/role change */
export const MY_SCOPE_CACHE_PREFIX = 'myscope:';
const MY_SCOPE_TTL_SECONDS = 300;
/** ARM → DI → trainer is 2 levels; the limit only guards against bad data */
const MAX_SCOPE_DEPTH = 4;

/**
 * Task 17 (Swadhaar): who a user may review.
 *
 * Scope = the Learners of every active group where the user is Reviewer (and of the sub-groups of
 * those groups), then, level by level, the Learners of groups reviewed by those Learners
 * (an ARM who reviews a group of DIs also sees each DI's team). Only group roles count
 * (CohortMembers.cohortRoleCode); the user's organisation role plays no part, except that a
 * tenant admin gets `all: true`.
 */
@Injectable()
export class HierarchyService {
  private readonly logger = new Logger(HierarchyService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cacheService: CacheService
  ) {}

  static cacheKey(tenantId: string, userId: string): string {
    return `${MY_SCOPE_CACHE_PREFIX}${tenantId}:${userId}`;
  }

  async getMyScope(userId: string, tenantId: string): Promise<MyScope> {
    const key = HierarchyService.cacheKey(tenantId, userId);
    const cached = await this.cacheService.get<MyScope>(key);
    if (cached) return cached;

    const scope = await this.buildScope(userId, tenantId);
    try {
      await this.cacheService.set(key, scope, MY_SCOPE_TTL_SECONDS);
    } catch (e) {
      this.logger.warn(`Could not cache my-scope for ${userId}: ${e?.message}`);
    }
    return scope;
  }

  /** True when the caller may see / act on targetUserId (admin, self, or in scope) */
  async isInScope(
    userId: string,
    tenantId: string,
    targetUserId: string
  ): Promise<boolean> {
    if (userId === targetUserId) return true;
    const scope = await this.getMyScope(userId, tenantId);
    return scope.all || scope.userIds.includes(targetUserId);
  }

  private async buildScope(userId: string, tenantId: string): Promise<MyScope> {
    const all = await this.isTenantAdmin(userId, tenantId);
    const groups: ScopeGroup[] = [];
    const seenGroups = new Set<string>();
    const seenUsers = new Set<string>([userId]);
    const inScope = new Set<string>();

    let reviewers = [userId];
    for (let depth = 1; depth <= MAX_SCOPE_DEPTH && reviewers.length > 0; depth++) {
      const reviewed = await this.findReviewedGroups(reviewers, tenantId);
      const fresh = reviewed.filter((g) => !seenGroups.has(g.cohortId));
      if (fresh.length === 0) break;
      fresh.forEach((g) => seenGroups.add(g.cohortId));

      const learnersByGroup = await this.findLearners(
        fresh.map((g) => g.cohortId)
      );
      const next: string[] = [];
      for (const g of fresh) {
        const learnerUserIds = (learnersByGroup.get(g.cohortId) || []).filter(
          (id) => id !== userId
        );
        groups.push({ ...g, depth, learnerUserIds });
        for (const id of learnerUserIds) {
          inScope.add(id);
          if (!seenUsers.has(id)) {
            seenUsers.add(id);
            next.push(id);
          }
        }
      }
      reviewers = next;
    }

    return {
      userId,
      tenantId,
      all,
      groups,
      userIds: [...inScope],
    };
  }

  /**
   * Active groups in the tenant where any of `reviewerIds` is an active Reviewer, plus their active
   * sub-groups (Cohort.parentId, any depth). A sub-group keeps the reviewer of its top group.
   */
  private async findReviewedGroups(
    reviewerIds: string[],
    tenantId: string
  ): Promise<Omit<ScopeGroup, 'depth' | 'learnerUserIds'>[]> {
    const rows: any[] = await this.dataSource.query(
      `WITH RECURSIVE reviewed AS (
         SELECT C."cohortId", C."name", NULL::text AS "parentCohortId",
                CM."userId" AS "reviewerUserId", ARRAY[C."cohortId"] AS path
         FROM public."CohortMembers" CM
         INNER JOIN public."Cohort" C ON C."cohortId" = CM."cohortId"
         WHERE CM."userId" = ANY($1::uuid[])
           AND CM."cohortRoleCode" = 'reviewer'
           AND CM."status" = 'active'
           AND C."tenantId" = $2
           AND COALESCE(C."status", 'active') = 'active'
         UNION ALL
         SELECT S."cohortId", S."name", R."cohortId"::text, R."reviewerUserId", R.path || S."cohortId"
         FROM reviewed R
         INNER JOIN public."Cohort" S ON S."parentId" = R."cohortId"::text
         WHERE S."tenantId" = $2
           AND COALESCE(S."status", 'active') = 'active'
           AND NOT S."cohortId" = ANY(R.path)
       )
       SELECT DISTINCT ON ("cohortId") "cohortId", "name", "parentCohortId", "reviewerUserId"
       FROM reviewed
       ORDER BY "cohortId", array_length(path, 1)`,
      [reviewerIds, tenantId]
    );
    return rows
      .map((r) => ({
        cohortId: r.cohortId,
        name: r.name,
        parentCohortId: r.parentCohortId ?? null,
        reviewerUserId: r.reviewerUserId,
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /** Active Learners of each group */
  private async findLearners(cohortIds: string[]): Promise<Map<string, string[]>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT CM."cohortId", CM."userId"
       FROM public."CohortMembers" CM
       WHERE CM."cohortId" = ANY($1::uuid[])
         AND CM."cohortRoleCode" = 'learner'
         AND CM."status" = 'active'`,
      [cohortIds]
    );
    const byGroup = new Map<string, string[]>();
    for (const r of rows) {
      const list = byGroup.get(r.cohortId) || [];
      list.push(r.userId);
      byGroup.set(r.cohortId, list);
    }
    return byGroup;
  }

  /** Same rule as the cohort-member admin check: an `admin` role in this tenant */
  private async isTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM public."UserRolesMapping" URM
       INNER JOIN public."Roles" R ON R."roleId" = URM."roleId"
       WHERE URM."userId" = $1 AND URM."tenantId" = $2 AND R."code" = 'admin'
       LIMIT 1`,
      [userId, tenantId]
    );
    return rows.length > 0;
  }
}
