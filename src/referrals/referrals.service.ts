import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ReferralReportFiltersDto, ReferralReportRequestDto, ReferralUserStatus } from './dto/referral-report.dto';
import { ReferralEntity } from './entities/referral-entity.entity';
import { ReferralSlugHistory } from './entities/referral-slug-history.entity';
import { UserAttribution } from './entities/user-attribution.entity';
import { User } from '../user/entities/user-entity';
import { CreateReferralEntityDto } from './dto/create-referral-entity.dto';
import { ImportReferralsDto } from './dto/import-referrals.dto';
import { UpdateReferralSlugDto } from './dto/update-referral-slug.dto';
import { ListReferralsDto } from './dto/list-referrals.dto';
import { ReferralEntitySubType, ReferralEntityType } from './referrals.types';
import {
  buildReferLink,
  generateReferralSlug,
  isValidStandardSlug,
  standardizeSlugInput,
} from './utils/referral-slug.util';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,
    @InjectRepository(ReferralSlugHistory)
    private readonly historyRepo: Repository<ReferralSlugHistory>,
    @InjectRepository(UserAttribution)
    private readonly attributionRepo: Repository<UserAttribution>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async createReferralEntity(dto: CreateReferralEntityDto, createdBy?: string) {
    let resolvedLinkedEntityId: string | null = dto.linkedEntityId ?? null;

    if (dto.contactEmail) {
      const existingEmail = await this.referralRepo.findOne({ where: { contactEmail: dto.contactEmail } });
      if (existingEmail) {
        throw new ConflictException(`Referral already exists for email ${dto.contactEmail}`);
      }

      if (dto.type === ReferralEntityType.INTERNAL) {
        const existingUser = await this.userRepo.findOne({ where: { email: dto.contactEmail.toLowerCase() } });
        if (!existingUser) {
          throw new BadRequestException(`Internal user email ${dto.contactEmail} does not exist in the system`);
        }
        resolvedLinkedEntityId = existingUser.userId;
      }
    }

    const entity = this.referralRepo.create({
      ...dto,
      lastName: dto.lastName ?? null,
      region: dto.region ?? null,
      linkedEntityId: resolvedLinkedEntityId,
      contactEmail: dto.contactEmail ?? null,
      additionalEmails: Array.isArray(dto.additionalEmails)
        ? dto.additionalEmails.join(',') || null
        : null,
      country: dto.country ?? null,
      createdBy: createdBy ?? null,
    });

    if (dto.slug) {
      const normalizedSlug = standardizeSlugInput(dto.slug);
      if (!normalizedSlug) {
        throw new BadRequestException('Provided slug is invalid after normalization');
      }
      const slugExists = await this.slugExistsAnywhere(normalizedSlug);
      if (slugExists) {
        throw new ConflictException(`Slug '${normalizedSlug}' already exists`);
      }
      entity.slug = normalizedSlug;
    } else {
      entity.slug = await this.generateUniqueSlug({
        type: dto.type,
        subType: dto.subType,
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
      });
    }

    try {
      const saved = await this.referralRepo.save(entity);
      return this.normalizeReferral({ ...saved, referLink: buildReferLink(saved.slug) });
    } catch (e: any) {
      // Unique constraint race/collision
      throw new ConflictException(e?.message ?? 'Failed to create referral entity');
    }
  }

  async getReferralById(id: string) {
    const entity = await this.referralRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Referral with id '${id}' not found`);
    }
    return this.normalizeReferral({ ...entity, referLink: buildReferLink(entity.slug) });
  }

  async listReferralEntities(dto: ListReferralsDto = {}) {
    const { limit = 10, offset = 0, filters } = dto;
    const query = this.referralRepo.createQueryBuilder('referral');

    if (filters) {
      if (filters.type) {
        query.andWhere('referral.type = :type', { type: filters.type });
      }
      if (filters.subType) {
        query.andWhere('referral.subType = :subType', { subType: filters.subType });
      }
      if (filters.search) {
        query.andWhere(
          '(LOWER(referral.firstName) LIKE LOWER(:search) OR LOWER(referral.lastName) LIKE LOWER(:search) OR LOWER(referral.contactEmail) LIKE LOWER(:search) OR LOWER(referral.slug) LIKE LOWER(:search))',
          { search: `%${filters.search}%` }
        );
      }
      if (filters.regions && filters.regions.length > 0) {
        query.andWhere('referral.region IN (:...regions)', { regions: filters.regions });
      }
      if (filters.countries && filters.countries.length > 0) {
        query.andWhere('referral.country IN (:...countries)', { countries: filters.countries });
      }
    }

    query.orderBy('referral.createdAt', 'DESC');
    query.skip(offset).take(limit);

    const [rows, total] = await query.getManyAndCount();

    const signupCounts = rows.length
      ? await this.dataSource.query<{ referralEntityId: string; signups: number }[]>(
          `SELECT ua."referralEntityId", COUNT(DISTINCT ua."userId")::int AS signups
           FROM "UserAttribution" ua
           JOIN "Users" u ON u."userId" = ua."userId"
           WHERE ua."referralEntityId" = ANY($1)
             AND u."status" IN ('active', 'inactive')
           GROUP BY ua."referralEntityId"`,
          [rows.map((r) => r.id)],
        )
      : [];

    const signupMap = new Map(signupCounts.map((s) => [s.referralEntityId, s.signups]));

    return {
      data: rows.map((r) => ({
        ...this.normalizeReferral({ ...r, referLink: buildReferLink(r.slug) }),
        signups: signupMap.get(r.id) ?? 0,
      })),
      total,
      limit,
      offset,
    };
  }

  async resolveSlug(incomingSlug: string) {
    const slug = standardizeSlugInput(incomingSlug);
    if (!slug) {
      throw new BadRequestException('Missing slug');
    }

    const active = await this.referralRepo.findOne({ where: { slug } });
    if (active) {
      return {
        entity: active,
        originalSlug: incomingSlug,
        resolvedSlug: active.slug,
        referLink: buildReferLink(active.slug),
      };
    }

    const hist = await this.historyRepo.findOne({ where: { oldSlug: slug } });
    if (!hist) {
      return {
        entity: null,
        originalSlug: incomingSlug,
        resolvedSlug: null,
        referLink: null,
      };
    }

    const resolved = await this.referralRepo.findOne({
      where: { id: hist.referralEntityId },
    });
    if (!resolved) {
      return {
        entity: null,
        originalSlug: incomingSlug,
        resolvedSlug: null,
        referLink: null,
      };
    }

    return {
      entity: resolved,
      originalSlug: incomingSlug,
      resolvedSlug: resolved.slug,
      referLink: buildReferLink(resolved.slug),
    };
  }

  async updateSlug(referralEntityId: string, dto: UpdateReferralSlugDto, changedBy?: string) {
    const entity = await this.referralRepo.findOne({ where: { id: referralEntityId } });
    if (!entity) {
      throw new NotFoundException('Referral entity not found');
    }

    // ── Scalar field updates ──────────────────────────────────────────────────
    if (dto.firstName !== undefined) entity.firstName = dto.firstName;
    if (dto.lastName !== undefined) entity.lastName = dto.lastName ?? null;
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.subType !== undefined) entity.subType = dto.subType;
    if (dto.region !== undefined) entity.region = dto.region ?? null;
    if (dto.country !== undefined) entity.country = dto.country ?? null;
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.additionalEmails !== undefined) {
      entity.additionalEmails = Array.isArray(dto.additionalEmails)
        ? dto.additionalEmails.join(',') || null
        : null;
    }

    // ── contactEmail: check uniqueness + internal user validation ────────────
    const resolvedType = dto.type ?? entity.type;
    if (dto.contactEmail !== undefined && dto.contactEmail !== entity.contactEmail) {
      const existingEmail = await this.referralRepo.findOne({ where: { contactEmail: dto.contactEmail } });
      if (existingEmail && existingEmail.id !== entity.id) {
        throw new ConflictException(`Contact email '${dto.contactEmail}' is already used by another referral`);
      }
      if (resolvedType === ReferralEntityType.INTERNAL) {
        const existingUser = await this.userRepo.findOne({ where: { email: dto.contactEmail.toLowerCase() } });
        if (!existingUser) {
          throw new BadRequestException(`Internal user email ${dto.contactEmail} does not exist in the system`);
        }
      }
      entity.contactEmail = dto.contactEmail;
    } else if (dto.type === ReferralEntityType.INTERNAL && entity.contactEmail) {
      // Type changed to INTERNAL without changing email — validate existing contact email
      const existingUser = await this.userRepo.findOne({ where: { email: entity.contactEmail.toLowerCase() } });
      if (!existingUser) {
        throw new BadRequestException(`Internal user email ${entity.contactEmail} does not exist in the system`);
      }
    }

    // ── Slug: normalize any format, check uniqueness, preserve history ───────
    let pendingSlug: string | null = null;
    if (dto.slug !== undefined) {
      const newSlug = standardizeSlugInput(dto.slug);
      if (!newSlug) {
        throw new BadRequestException('Provided slug is invalid after normalization');
      }
      if (!isValidStandardSlug(newSlug)) {
        throw new BadRequestException('Slug must contain only lowercase a-z, 0-9, and _');
      }
      if (newSlug !== entity.slug) {
        await this.assertSlugUnique(newSlug);
        pendingSlug = newSlug;
      }
    }

    // Wrap history record + entity save in a transaction so they succeed or fail together
    const saved = await this.dataSource.transaction(async (manager) => {
      if (pendingSlug !== null) {
        await manager.save(
          this.historyRepo.create({
            referralEntityId: entity.id,
            oldSlug: entity.slug,
            newSlug: pendingSlug,
            changedBy: changedBy ?? null,
          }),
        );
        entity.slug = pendingSlug;
      }
      return manager.save(entity);
    });
    return this.normalizeReferral({ ...saved, referLink: buildReferLink(saved.slug) });
  }

  async createUserAttribution(params: {
    userId: string;
    incomingSlug?: string | null;
  }) {
    const incoming = params.incomingSlug ? String(params.incomingSlug).trim() : '';
    if (!incoming) {
      return { referLink: null, resolvedSlug: null, referralEntityId: null };
    }

    const resolved = await this.resolveSlug(incoming);
    await this.attributionRepo.save(
      this.attributionRepo.create({
        userId: params.userId,
        referralEntityId: resolved.entity?.id ?? null,
        referralSlug: resolved.resolvedSlug ?? null,
        originalReferralSlug: incoming,
      })
    );

    return {
      referLink: resolved.referLink ?? null,
      resolvedSlug: resolved.resolvedSlug ?? null,
      referralEntityId: resolved.entity?.id ?? null,
    };
  }

  async getUserReferLink(userId: string): Promise<string | null> {
    const attr = await this.attributionRepo.findOne({ where: { userId } });
    if (!attr?.referralSlug) return null;
    return buildReferLink(attr.referralSlug);
  }

  async importFromCsv(dto: ImportReferralsDto, createdBy?: string) {
    const csv = String(dto.csv || '').trim();
    if (!csv) throw new BadRequestException('CSV is empty');

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new BadRequestException('CSV must include header and at least one row');

    const header = lines[0].split(',').map((h) => h.trim());
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const iFirst = idx('firstName');
    const iLast = idx('lastName');
    const iType = idx('type');
    const iSubType = idx('subType');
    const iRegion = idx('region');
    const iEmail = idx('contactEmail');
    const iCountry = idx('country');

    if (iFirst < 0 || iType < 0 || iSubType < 0) {
      throw new BadRequestException('CSV header must include at least: firstName,type,subType');
    }

    const created: any[] = [];
    const errors: any[] = [];

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cols = lines[rowIdx].split(',').map((c) => c.trim());
      const firstName = cols[iFirst] ?? '';
      const lastName = iLast >= 0 ? cols[iLast] : '';
      const type = cols[iType] as ReferralEntityType;
      const subType = cols[iSubType] as ReferralEntitySubType;
      const region = iRegion >= 0 ? cols[iRegion] : undefined;
      const contactEmail = iEmail >= 0 ? cols[iEmail] : undefined;
      const country = iCountry >= 0 ? cols[iCountry] : undefined;

      try {
        if (!firstName) throw new BadRequestException('firstName is required');
        if (!Object.values(ReferralEntityType).includes(type)) {
          throw new BadRequestException(`Invalid type: ${type}`);
        }
        if (!Object.values(ReferralEntitySubType).includes(subType)) {
          throw new BadRequestException(`Invalid subType: ${subType}`);
        }

        const saved = await this.createReferralEntity(
          {
            firstName,
            lastName: lastName || undefined,
            type,
            subType,
            region,
            contactEmail,
            country,
          },
          createdBy
        );
        created.push(saved);
      } catch (e: any) {
        errors.push({ row: rowIdx + 1, error: e?.message ?? 'Failed' });
      }
    }

    return { createdCount: created.length, errorCount: errors.length, created, errors };
  }

  async bulkInsert(dtos: CreateReferralEntityDto[], createdBy?: string) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new BadRequestException('Payload must be a non-empty array of referrals');
    }

    const rawBatchSize = Number.parseInt(this.configService.get('REFERRAL_BULK_BATCH_SIZE') || '100', 10);
    const batchSize = Number.isFinite(rawBatchSize) && rawBatchSize > 0 ? rawBatchSize : 100;
    const created: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < dtos.length; i += batchSize) {
      const batch = dtos.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (dto, idx) => {
        const globalIdx = i + idx;
        try {
          const saved = await this.createReferralEntity(dto, createdBy);
          created.push(saved);
        } catch (e: any) {
          errors.push({ index: globalIdx, data: dto, error: e?.message ?? 'Failed' });
        }
      });
      
      await Promise.all(batchPromises);
    }

    return { createdCount: created.length, errorCount: errors.length, created, errors };
  }

  private normalizeReferral(entity: ReferralEntity & { referLink?: string }) {
    const emailsArr = entity.additionalEmails
      ? String(entity.additionalEmails).split(',').map((e) => e.trim()).filter(Boolean)
      : [];
    return {
      ...entity,
      additionalEmails: emailsArr,
      additionalEmailCount: emailsArr.length,
    };
  }

  private async generateUniqueSlug(params: {
    type: ReferralEntityType;
    subType: ReferralEntitySubType;
    firstName: string;
    lastName?: string | null;
  }) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = generateReferralSlug({
        type: params.type,
        subType: params.subType,
        firstName: params.firstName,
        lastName: params.lastName ?? null,
      });
      const exists = await this.slugExistsAnywhere(slug);
      if (!exists) return slug;
    }
    throw new ConflictException('Failed to generate unique slug');
  }

  private async assertSlugUnique(slug: string) {
    const exists = await this.slugExistsAnywhere(slug);
    if (exists) {
      throw new ConflictException('Slug already exists');
    }
  }

  private async slugExistsAnywhere(slug: string) {
    const active = await this.referralRepo.count({ where: { slug } });
    if (active > 0) return true;
    const hist = await this.historyRepo.count({ where: { oldSlug: slug } });
    return hist > 0;
  }

  // ── Referral Report (user-centric) ────────────────────────────────────────

  async getReferralReport(dto: ReferralReportRequestDto) {
    const { limit = 10, offset = 0, filters = {} } = dto;

    const { fromSql, whereClause, params } = this.buildReportBase(filters);

    const listSql = `
      SELECT
        re."id"                  AS "slug_id",
        re."slug",
        re."firstName"           AS "referralName",
        re."lastName"            AS "referralLastName",
        re."contactEmail"        AS "referralContactEmail",
        re."type"                AS "referralType",
        re."subType"             AS "referralSubType",
        u."userId",
        u."firstName",
        u."lastName",
        u."email",
        u."status"               AS "accountStatus",
        u."country",
        u."createdAt",
        u."auto_tags"            AS "tags",
        ua."createdAt"           AS "attributedAt"
      ${fromSql}
      ${whereClause}
      ORDER BY ua."createdAt" DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countSql = `SELECT COUNT(DISTINCT ua."userId")::int AS count ${fromSql} ${whereClause}`;

    const [[countRow], userRows] = await Promise.all([
      this.dataSource.query<any[]>(countSql, params),
      this.dataSource.query<any[]>(listSql, [...params, limit, offset]),
    ]);

    const totalCount = countRow?.count ?? 0;

    if (userRows.length === 0) {
      return { data: [], totalCount, limit, offset, hasMore: false };
    }

    // Fetch cohort memberships for returned users — scoped to filtered cohorts if provided
    const userIds = [...new Set(userRows.map((r) => r.userId))];
    const membershipQuery = filters.cohortIds?.length
      ? `SELECT cm."userId", cm."cohortId", cm."status", c."name" AS "cohortName"
         FROM "CohortMembers" cm
         LEFT JOIN "Cohort" c ON c."cohortId" = cm."cohortId"
         WHERE cm."userId" = ANY($1) AND cm."cohortId" = ANY($2)`
      : `SELECT cm."userId", cm."cohortId", cm."status", c."name" AS "cohortName"
         FROM "CohortMembers" cm
         LEFT JOIN "Cohort" c ON c."cohortId" = cm."cohortId"
         WHERE cm."userId" = ANY($1)`;
    const membershipParams = filters.cohortIds?.length ? [userIds, filters.cohortIds] : [userIds];

    const memberships = await this.dataSource.query<any[]>(membershipQuery, membershipParams);
    const membershipMap = new Map<string, { cohortId: string; cohortName: string | null; status: string }[]>();
    for (const m of memberships) {
      if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, []);
      membershipMap.get(m.userId)?.push({ cohortId: m.cohortId, cohortName: m.cohortName ?? null, status: m.status });
    }

    const data = userRows.map((row) => {
      const cohortMemberships = membershipMap.get(row.userId) ?? [];

      return {
        slug_id: row.slug_id,
        slug: row.slug,
        referralName: [row.referralName, row.referralLastName].filter(Boolean).join(' '),
        referralContactEmail: row.referralContactEmail,
        referralType: row.referralType,
        referralSubType: row.referralSubType,
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        country: row.country,
        createdAt: row.createdAt,
        attributedAt: row.attributedAt,
        accountStatus: row.accountStatus,
        tags: row.tags ?? [],
        cohortMemberships,
      };
    });

    return { data, totalCount, limit, offset, hasMore: offset + limit < totalCount };
  }


  private buildReportBase(filters: ReferralReportFiltersDto): { fromSql: string; whereClause: string; params: any[] } {
    const conds: string[] = [];
    const params: any[] = [];
    let idx = 1;

    // ── Slug / slug_id filter ─────────────────────────────────────────────────
    if (filters.slug_id && filters.slug) {
      conds.push(
        `(re."id" = $${idx} OR re."slug" = $${idx + 1} OR EXISTS(SELECT 1 FROM "ReferralSlugHistory" rsh WHERE rsh."referralEntityId" = re."id" AND rsh."oldSlug" = $${idx + 1}))`,
      );
      params.push(filters.slug_id, filters.slug);
      idx += 2;
    } else if (filters.slug_id) {
      conds.push(`re."id" = $${idx++}`);
      params.push(filters.slug_id);
    } else if (filters.slug) {
      conds.push(
        `(re."slug" = $${idx} OR EXISTS(SELECT 1 FROM "ReferralSlugHistory" rsh WHERE rsh."referralEntityId" = re."id" AND rsh."oldSlug" = $${idx}))`,
      );
      params.push(filters.slug);
      idx++;
    }

    // ── Cohort filter ─────────────────────────────────────────────────────────
    let cohortIdsParamIdx: number | null = null;
    if (filters.cohortIds?.length) {
      cohortIdsParamIdx = idx; // remember position so status filter can reuse it
      conds.push(
        `EXISTS (SELECT 1 FROM "CohortMembers" cf WHERE cf."userId" = ua."userId" AND cf."cohortId" = ANY($${idx++}))`,
      );
      params.push(filters.cohortIds);
    }

    // ── Tags filter ───────────────────────────────────────────────────────────
    if (filters.tags?.length) {
      conds.push(`u."auto_tags" && $${idx++}`);
      params.push(filters.tags);
    }

    // ── Country filter ────────────────────────────────────────────────────────
    if (filters.countries?.length) {
      conds.push(`u."country" = ANY($${idx++})`);
      params.push(filters.countries);
    }

    // ── Name search (user firstName/lastName or referral entity name) ─────────
    if (filters.name?.trim()) {
      const pattern = `%${filters.name.trim()}%`;
      conds.push(
        `(u."firstName" ILIKE $${idx} OR u."lastName" ILIKE $${idx} OR re."firstName" ILIKE $${idx} OR re."lastName" ILIKE $${idx})`,
      );
      params.push(pattern);
      idx++;
    }

    // ── Status filter (OR across all provided statuses) ───────────────────────
    if (filters.statuses?.length) {
      const sc: string[] = [];
      const s = filters.statuses;

      if (s.includes(ReferralUserStatus.REGISTERED)) sc.push(`u."temporaryPassword" = true`);
      if (s.includes(ReferralUserStatus.ACTIVATED))  sc.push(`u."temporaryPassword" = false`);

      const accountStatuses = s.filter((x) => (
        [ReferralUserStatus.ACTIVE, ReferralUserStatus.INACTIVE, ReferralUserStatus.ARCHIVED] as string[]
      ).includes(x));
      if (accountStatuses.length) {
        sc.push(`u."status" = ANY($${idx++})`);
        params.push(accountStatuses);
      }

      const cohortStatuses = s.filter((x) => (
        [ReferralUserStatus.APPLIED, ReferralUserStatus.SUBMITTED,
          ReferralUserStatus.SHORTLISTED, ReferralUserStatus.REJECTED, ReferralUserStatus.DROPOUT] as string[]
      ).includes(x));
      if (cohortStatuses.length) {
        // When cohortIds filter is also active, scope status check to those same cohorts.
        // This prevents a user with "applied" in cohort B from passing when cohort A is filtered.
        const cohortScope = cohortIdsParamIdx === null
          ? ''
          : `AND csf."cohortId" = ANY($${cohortIdsParamIdx})`;
        sc.push(
          `EXISTS (SELECT 1 FROM "CohortMembers" csf WHERE csf."userId" = ua."userId" AND csf."status" = ANY($${idx++}) ${cohortScope})`,
        );
        params.push(cohortStatuses);
      }

      if (sc.length) conds.push(`(${sc.join(' OR ')})`);
    }

    const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const fromSql = `
      FROM "UserAttribution" ua
      JOIN "ReferralEntities" re ON re."id" = ua."referralEntityId"
      JOIN "Users" u ON u."userId" = ua."userId"
    `;

    return { fromSql, whereClause, params };
  }

}

