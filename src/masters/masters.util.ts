import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { API_RESPONSES } from '@utils/response.messages';
import { MASTER_LIST_DEFAULT_LIMIT } from './dto/masters.dto';

export interface MasterPage<T> {
  totalCount: number;
  items: T[];
}

/** Escapes LIKE wildcards so a search for "sw_d%" matches those characters literally. */
export const likePattern = (search: string): string =>
  `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Postgres unique_violation: two admins creating the same code at once. */
export const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: string })?.code === '23505';

/**
 * TypeORM's raw query returns [rows, affectedCount] for UPDATE/DELETE and plain rows
 * for everything else. This returns the rows either way.
 */
export const rowsOf = <T>(result: unknown): T[] => {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return (result as T[]) ?? [];
};

/** Splits COUNT(*) OVER() off each row into one totalCount. */
export const toPage = <T>(rows: Array<T & { totalCount?: number | string }>): MasterPage<T> => ({
  totalCount: rows.length ? Number(rows[0].totalCount) : 0,
  items: rows.map(({ totalCount, ...item }) => item as unknown as T),
});

export const paging = (dto: { limit?: number; offset?: number }) => ({
  limit: dto.limit ?? MASTER_LIST_DEFAULT_LIMIT,
  offset: dto.offset ?? 0,
});

export const requireTenant = (tenantId: string | undefined): string => {
  if (!tenantId || !isUUID(tenantId)) {
    throw new BadRequestException(API_RESPONSES.MASTER_TENANT_REQUIRED);
  }
  return tenantId;
};

/** The logged-in admin, from the Keycloak token the JwtAuthGuard put on the request. */
export const actorOf = (request: { user?: { userId?: string; sub?: string } }): string | null =>
  request?.user?.userId || request?.user?.sub || null;

export const requireSomethingToUpdate = (dto: { name?: string; isActive?: boolean }) => {
  if (dto.name === undefined && dto.isActive === undefined) {
    throw new BadRequestException(API_RESPONSES.MASTER_NOTHING_TO_UPDATE);
  }
};
