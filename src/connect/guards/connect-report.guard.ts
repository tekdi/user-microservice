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
  CONNECT_REPORT_PRIVILEGE,
} from "../constants/connect.constants";

/**
 * B9 /connect/admin/reports only. The caller needs, in the tenantid tenant,
 * the admin role (same as ConnectAdminGuard) OR a role mapped to the
 * connect.report.view privilege (Privilege Management in the admin app).
 * Read from the DB, not the token. The middleware checks the same rule, but
 * the export worker calls this service directly, so it is checked here too.
 * Use after JwtAuthGuard.
 */
@Injectable()
export class ConnectReportGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const tenantId = request.headers?.tenantid;
    if (!isUUID(userId) || !isUUID(tenantId)) {
      throw new ForbiddenException(CONNECT_ERRORS.REPORT_ACCESS.message);
    }

    const key = CONNECT_CACHE.REPORT_ACCESS_KEY(tenantId, userId);
    let cached: { allowed: boolean } | null = null;
    try {
      cached = await this.cacheService.get<{ allowed: boolean }>(key);
    } catch {
      cached = null;
    }

    let allowed = cached?.allowed;
    if (allowed === undefined) {
      const rows = await this.dataSource.query(
        `SELECT 1
           FROM "UserRolesMapping" urm
           JOIN "Roles" r ON r."roleId" = urm."roleId"
          WHERE urm."userId" = $1 AND urm."tenantId" = $2
            AND (
              r."code" = ANY($3::text[])
              OR EXISTS (
                SELECT 1
                  FROM "RolePrivilegesMapping" rpm
                  JOIN "Privileges" p ON p."privilegeId" = rpm."privilegeId"
                 WHERE rpm."roleId" = urm."roleId"
                   AND (rpm."tenantId" = $2 OR rpm."tenantId" IS NULL)
                   AND p."code" = $4
              )
            )
          LIMIT 1`,
        [userId, tenantId, CONNECT_ADMIN_ROLE_CODES, CONNECT_REPORT_PRIVILEGE]
      );
      allowed = rows.length > 0;
      try {
        await this.cacheService.set(key, { allowed }, CONNECT_CACHE.ADMIN_TTL);
      } catch {
        // cache is optional
      }
    }

    if (!allowed) {
      throw new ForbiddenException(CONNECT_ERRORS.REPORT_ACCESS.message);
    }
    return true;
  }
}
