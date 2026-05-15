import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService
  ) {}

  async createReferralEntity(dto: CreateReferralEntityDto, createdBy?: string) {
    if (dto.contactEmail) {
      const existingEmail = await this.referralRepo.findOne({ where: { contactEmail: dto.contactEmail } });
      if (existingEmail) {
        throw new ConflictException(`Referral slug already exists for email ${dto.contactEmail}`);
      }

      if (dto.type === ReferralEntityType.INTERNAL) {
        const existingUser = await this.userRepo.findOne({ where: { email: dto.contactEmail.toLowerCase() } });
        if (!existingUser) {
          throw new BadRequestException(`Internal user email ${dto.contactEmail} does not exist in the system`);
        }
      }
    }

    const entity = this.referralRepo.create({
      ...dto,
      lastName: dto.lastName ?? null,
      region: dto.region ?? null,
      linkedEntityId: (dto as any).linkedEntityId ?? null,
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
    
    return {
      data: rows.map((r) => this.normalizeReferral({ ...r, referLink: buildReferLink(r.slug) })),
      total,
      limit,
      offset
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
    if (dto.contactEmail !== undefined && dto.contactEmail !== entity.contactEmail) {
      const existingEmail = await this.referralRepo.findOne({ where: { contactEmail: dto.contactEmail } });
      if (existingEmail && existingEmail.id !== entity.id) {
        throw new ConflictException(`Contact email '${dto.contactEmail}' is already used by another referral`);
      }
      const resolvedType = dto.type ?? entity.type;
      if (resolvedType === ReferralEntityType.INTERNAL) {
        const existingUser = await this.userRepo.findOne({ where: { email: dto.contactEmail.toLowerCase() } });
        if (!existingUser) {
          throw new BadRequestException(`Internal user email ${dto.contactEmail} does not exist in the system`);
        }
      }
      entity.contactEmail = dto.contactEmail;
    }

    // ── Slug: normalize any format, check uniqueness, preserve history ───────
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
        await this.historyRepo.save(
          this.historyRepo.create({
            referralEntityId: entity.id,
            oldSlug: entity.slug,
            newSlug,
            changedBy: changedBy ?? null,
          })
        );
        entity.slug = newSlug;
      }
    }

    const saved = await this.referralRepo.save(entity);
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

    const batchSize = parseInt(this.configService.get('REFERRAL_BULK_BATCH_SIZE') || '100', 10);
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
      ? (entity.additionalEmails as string).split(',').map((e) => e.trim()).filter(Boolean)
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
}

