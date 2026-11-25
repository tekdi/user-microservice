import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { API_RESPONSES } from '@utils/response.messages';
import {
  CreateOrganisationDto,
  OrganisationListDto,
  UpdateOrganisationDto,
} from './dto/masters.dto';
import {
  isUniqueViolation,
  likePattern,
  MasterPage,
  paging,
  requireSomethingToUpdate,
  rowsOf,
  toPage,
} from './masters.util';

export interface Organisation {
  organisationId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = `"organisationId", "code", "name", "isActive", "createdAt", "updatedAt"`;

/**
 * Org Management. Organisations live in public."Organisations" (sql/020, sql/026).
 * Users keep their own copy of the org name (Users.organisationName), so a rename
 * updates those users too. Nothing is deleted: isActive=false deactivates.
 */
@Injectable()
export class OrganisationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    tenantId: string,
    dto: OrganisationListDto
  ): Promise<MasterPage<Organisation & { userCount: number }>> {
    const params: unknown[] = [tenantId];
    const where = [`o."tenantId" = $1`];
    if (dto.search) {
      params.push(likePattern(dto.search));
      where.push(`(o."name" ILIKE $${params.length} OR o."code" ILIKE $${params.length})`);
    }
    if (dto.isActive !== undefined) {
      params.push(dto.isActive);
      where.push(`o."isActive" = $${params.length}`);
    }
    const { limit, offset } = paging(dto);
    params.push(limit, offset);

    const rows = await this.dataSource.query(
      `SELECT o."organisationId", o."code", o."name", o."isActive", o."createdAt", o."updatedAt",
              (SELECT COUNT(*)::int
                 FROM public."Users" u
                 JOIN public."UserTenantMapping" utm
                   ON utm."userId" = u."userId" AND utm."tenantId" = o."tenantId"
                WHERE u."organisationCode" = o."code") AS "userCount",
              COUNT(*) OVER()::int AS "totalCount"
         FROM public."Organisations" o
        WHERE ${where.join(' AND ')}
        ORDER BY o."name" ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return toPage(rows);
  }

  async create(
    tenantId: string,
    actorId: string | null,
    dto: CreateOrganisationDto
  ): Promise<Organisation> {
    const code = dto.code.toUpperCase();
    const taken = await this.dataSource.query(
      `SELECT "code", "name" FROM public."Organisations"
        WHERE "tenantId" = $1 AND ("code" = $2 OR LOWER("name") = LOWER($3))`,
      [tenantId, code, dto.name]
    );
    if (taken.some((row: { code: string }) => row.code === code)) {
      throw new ConflictException(API_RESPONSES.ORGANISATION_CODE_EXISTS(code));
    }
    if (taken.length) {
      throw new ConflictException(API_RESPONSES.ORGANISATION_NAME_EXISTS(taken[0].name));
    }

    try {
      const [created] = await this.dataSource.query(
        `INSERT INTO public."Organisations" ("tenantId", "code", "name", "createdBy", "updatedBy")
         VALUES ($1, $2, $3, $4, $4)
         RETURNING ${COLUMNS}`,
        [tenantId, code, dto.name, actorId]
      );
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(API_RESPONSES.ORGANISATION_CODE_EXISTS(code));
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    actorId: string | null,
    organisationId: string,
    dto: UpdateOrganisationDto
  ): Promise<{ organisation: Organisation; usersUpdated: number }> {
    requireSomethingToUpdate(dto);

    const [existing] = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM public."Organisations"
        WHERE "organisationId" = $1 AND "tenantId" = $2`,
      [organisationId, tenantId]
    );
    if (!existing) {
      throw new NotFoundException(API_RESPONSES.ORGANISATION_ID_NOT_FOUND);
    }

    const rename = dto.name !== undefined && dto.name !== existing.name;
    if (rename) {
      const clash = await this.dataSource.query(
        `SELECT "organisationId" FROM public."Organisations"
          WHERE "tenantId" = $1 AND LOWER("name") = LOWER($2) AND "organisationId" <> $3`,
        [tenantId, dto.name, organisationId]
      );
      if (clash.length) {
        throw new ConflictException(API_RESPONSES.ORGANISATION_NAME_EXISTS(dto.name));
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const [organisation] = rowsOf<Organisation>(
        await manager.query(
          `UPDATE public."Organisations"
              SET "name" = COALESCE($1, "name"),
                  "isActive" = COALESCE($2, "isActive"),
                  "updatedBy" = $3,
                  "updatedAt" = CURRENT_TIMESTAMP
            WHERE "organisationId" = $4 AND "tenantId" = $5
          RETURNING ${COLUMNS}`,
          [rename ? dto.name : null, dto.isActive ?? null, actorId, organisationId, tenantId]
        )
      );

      let usersUpdated = 0;
      if (rename) {
        const users = rowsOf(
          await manager.query(
            `UPDATE public."Users" u
                SET "organisationName" = $1, "updatedBy" = $2, "updatedAt" = CURRENT_TIMESTAMP
               FROM public."UserTenantMapping" utm
              WHERE utm."userId" = u."userId"
                AND u."organisationCode" = $3
                AND utm."tenantId" = $4
            RETURNING u."userId"`,
            [dto.name, actorId, existing.code, tenantId]
          )
        );
        usersUpdated = users.length;
      }
      return { organisation, usersUpdated };
    });
  }
}
