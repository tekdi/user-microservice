import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { isUUID } from "class-validator";
import { CacheService } from "src/cache/cache.service";
import {
  CONNECT_ADMIN_ROLE_CODES,
  CONNECT_CACHE,
  CONNECT_ERRORS,
} from "../constants/connect.constants";

/**
 * /connect/admin/* only: the caller must hold an admin role in the tenant
 * sent in the tenantid header. Roles are read from the DB (UserRolesMapping),
 * not from the token, so a learner token gets 403 even with a valid JWT.
 * Use after JwtAuthGuard.
 */
@Injectable()
export class ConnectAdminGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const tenantId = request.headers?.tenantid;
    if (!isUUID(userId) || !isUUID(tenantId)) {
      throw new ForbiddenException(CONNECT_ERRORS.ADMIN_ONLY.message);
    }

    const key = CONNECT_CACHE.ADMIN_KEY(tenantId, userId);
    let cached: { isAdmin: boolean } | null = null;
    try {
      cached = await this.cacheService.get<{ isAdmin: boolean }>(key);
    } catch {
      cached = null;
    }

    let isAdmin = cached?.isAdmin;
    if (isAdmin === undefined) {
      const rows = await this.dataSource.query(
        `SELECT 1 FROM "UserRolesMapping" urm
           JOIN "Roles" r ON r."roleId" = urm."roleId"
          WHERE urm."userId" = $1 AND urm."tenantId" = $2
            AND r."code" = ANY($3::text[])
          LIMIT 1`,
        [userId, tenantId, CONNECT_ADMIN_ROLE_CODES]
      );
      isAdmin = rows.length > 0;
      try {
        await this.cacheService.set(key, { isAdmin }, CONNECT_CACHE.ADMIN_TTL);
      } catch {
        // cache is optional
      }
    }

    if (!isAdmin) {
      throw new ForbiddenException(CONNECT_ERRORS.ADMIN_ONLY.message);
    }
    return true;
  }
}
