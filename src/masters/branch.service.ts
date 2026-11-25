import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { API_RESPONSES } from '@utils/response.messages';
import { BranchListDto, CreateBranchDto, UpdateBranchDto } from './dto/masters.dto';
import {
  isUniqueViolation,
  likePattern,
  MasterPage,
  paging,
  requireSomethingToUpdate,
  rowsOf,
  toPage,
} from './masters.util';

export interface LocationOption {
  value: string;
  name: string;
}

export interface Branch {
  value: string;
  code: string | null;
  name: string;
  isActive: boolean;
  districtValue: string;
}

export interface BranchListItem extends Branch {
  districtName: string | null;
  stateValue: string | null;
  stateName: string | null;
  userCount: number;
}

const BRANCH_COLUMNS = `"value", "code", "name", "isActive", "controllingfieldfk" AS "districtValue"`;

/**
 * Branch Management. Branches are options of the `block` custom field, stored in
 * public."block" and linked to a district (public."city") through controllingfieldfk;
 * districts link to public."states" the same way. Users store the branch's `value`
 * in FieldValues, so a rename needs no change to user records.
 *
 * States and districts are a fixed master list: read-only here. Admins add branches
 * (name + code) under a district. Nothing is deleted: isActive=false deactivates.
 */
@Injectable()
export class BranchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  listStates(tenantId: string): Promise<LocationOption[]> {
    return this.dataSource.query(
      `SELECT "value", "name" FROM public."states"
        WHERE "tenantId" = $1
        ORDER BY "name" ASC`,
      [tenantId]
    );
  }

  listDistricts(
    tenantId: string,
    stateValue?: string
  ): Promise<(LocationOption & { stateValue: string })[]> {
    const params = [tenantId];
    let byState = '';
    if (stateValue) {
      params.push(stateValue);
      byState = ` AND "controllingfieldfk" = $2`;
    }
    return this.dataSource.query(
      `SELECT "value", "name", "controllingfieldfk" AS "stateValue" FROM public."city"
        WHERE "tenantId" = $1${byState}
        ORDER BY "name" ASC`,
      params
    );
  }

  async list(tenantId: string, dto: BranchListDto): Promise<MasterPage<BranchListItem>> {
    const params: unknown[] = [tenantId];
    const where = [`b."tenantId" = $1`];
    if (dto.stateValue) {
      params.push(dto.stateValue);
      where.push(`s."value" = $${params.length}`);
    }
    if (dto.districtValue) {
      params.push(dto.districtValue);
      where.push(`b."controllingfieldfk" = $${params.length}`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      where.push(`b."isActive" = $${params.length}`);
    }
    if (dto.search) {
      params.push(likePattern(dto.search));
      where.push(`(b."name" ILIKE $${params.length} OR b."code" ILIKE $${params.length})`);
    }
    const { limit, offset } = paging(dto);
    params.push(limit, offset);

    const rows = await this.dataSource.query(
      `SELECT b."value", b."code", b."name", b."isActive",
              b."controllingfieldfk" AS "districtValue", d."name" AS "districtName",
              s."value" AS "stateValue", s."name" AS "stateName",
              (SELECT COUNT(*)::int
                 FROM public."FieldValues" fv
                WHERE fv."value" = b."value"
                  AND fv."fieldId" IN (SELECT f."fieldId" FROM public."Fields" f WHERE f."name" = 'block')
              ) AS "userCount",
              COUNT(*) OVER()::int AS "totalCount"
         FROM public."block" b
         LEFT JOIN public."city" d
           ON d."value" = b."controllingfieldfk" AND d."tenantId" = b."tenantId"
         LEFT JOIN public."states" s
           ON s."value" = d."controllingfieldfk" AND s."tenantId" = d."tenantId"
        WHERE ${where.join(' AND ')}
        ORDER BY s."name" ASC, d."name" ASC, b."name" ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return toPage(rows);
  }

  async create(
    tenantId: string,
    actorId: string | null,
    dto: CreateBranchDto
  ): Promise<Branch & { districtName: string; stateValue: string }> {
    const code = dto.code.toUpperCase();
    const [district] = await this.dataSource.query(
      `SELECT "value", "name", "controllingfieldfk" AS "stateValue" FROM public."city"
        WHERE "value" = $1 AND "tenantId" = $2`,
      [dto.districtValue, tenantId]
    );
    if (!district) {
      throw new BadRequestException(API_RESPONSES.BRANCH_DISTRICT_NOT_FOUND(dto.districtValue));
    }

    try {
      const branch: Branch = await this.dataSource.transaction(async (manager) => {
        // Serialises branch creates so two admins never pick the same next value.
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext('masters.block.create'))`);

        const taken = await manager.query(
          `SELECT "code", "name", "controllingfieldfk" AS "districtValue" FROM public."block"
            WHERE "tenantId" = $1
              AND (UPPER("code") = $2 OR ("controllingfieldfk" = $3 AND LOWER("name") = LOWER($4)))`,
          [tenantId, code, dto.districtValue, dto.name]
        );
        if (taken.some((row: { code: string | null }) => row.code?.toUpperCase() === code)) {
          throw new ConflictException(API_RESPONSES.BRANCH_CODE_EXISTS(code));
        }
        if (taken.length) {
          throw new ConflictException(
            API_RESPONSES.BRANCH_NAME_EXISTS(taken[0].name, district.name)
          );
        }

        // Existing branch values are numeric ids (1..5985 in QA); continue the sequence.
        const [{ nextValue }] = await manager.query(
          `SELECT (COALESCE(MAX("value"::bigint), 0) + 1)::text AS "nextValue"
             FROM public."block" WHERE "value" ~ '^[0-9]+$'`
        );

        const [created] = await manager.query(
          `INSERT INTO public."block"
             ("name", "value", "code", "controllingfieldfk", "tenantId", "isActive", "createdBy", "updatedBy")
           VALUES ($1, $2, $3, $4, $5, true, $6, $6)
           RETURNING ${BRANCH_COLUMNS}`,
          [dto.name, nextValue, code, dto.districtValue, tenantId, actorId]
        );
        return created;
      });
      return { ...branch, districtName: district.name, stateValue: district.stateValue };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(API_RESPONSES.BRANCH_CODE_EXISTS(code));
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    actorId: string | null,
    value: string,
    dto: UpdateBranchDto
  ): Promise<Branch> {
    requireSomethingToUpdate(dto);

    const [existing] = await this.dataSource.query(
      `SELECT b."value", b."code", b."name", b."isActive",
              b."controllingfieldfk" AS "districtValue", d."name" AS "districtName"
         FROM public."block" b
         LEFT JOIN public."city" d
           ON d."value" = b."controllingfieldfk" AND d."tenantId" = b."tenantId"
        WHERE b."value" = $1 AND b."tenantId" = $2`,
      [value, tenantId]
    );
    if (!existing) {
      throw new NotFoundException(API_RESPONSES.BRANCH_NOT_FOUND);
    }

    const rename = dto.name !== undefined && dto.name !== existing.name;
    if (rename) {
      const clash = await this.dataSource.query(
        `SELECT "value" FROM public."block"
          WHERE "tenantId" = $1 AND "controllingfieldfk" = $2
            AND LOWER("name") = LOWER($3) AND "value" <> $4`,
        [tenantId, existing.districtValue, dto.name, value]
      );
      if (clash.length) {
        throw new ConflictException(
          API_RESPONSES.BRANCH_NAME_EXISTS(dto.name, existing.districtName ?? 'this district')
        );
      }
    }

    const [branch] = rowsOf<Branch>(
      await this.dataSource.query(
        `UPDATE public."block"
            SET "name" = COALESCE($1, "name"),
                "isActive" = COALESCE($2, "isActive"),
                "updatedBy" = $3,
                "updatedAt" = CURRENT_TIMESTAMP
          WHERE "value" = $4 AND "tenantId" = $5
        RETURNING ${BRANCH_COLUMNS}`,
        [rename ? dto.name : null, dto.isActive ?? null, actorId, value, tenantId]
      )
    );
    return branch;
  }
}
