import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DataSource } from "typeorm";
import { isUUID } from "class-validator";
import { CacheService } from "src/cache/cache.service";
import {
  CONNECT_ADMIN_ROLE_CODES,
  CONNECT_CACHE,
  CONNECT_ERRORS,
} from "../constants/connect.constants";
import { CONNECT_ADMIN_PRIVILEGES_KEY } from "./connect-admin-privileges.decorator";

interface AdminAccess {
  isAdmin: boolean;
  /** connect.* privilege codes held through any of the caller's roles */
  privileges: string[];
}

/**
 * /connect/admin/* only. Passes when the caller has, in the tenant sent in
 * the tenantid header:
 *  - the admin role, or
 *  - a privilege listed by @ConnectAdminPrivileges() on the route
 *    (B4–B6 master data). Routes without it (B7) stay admin-role only.
 * Roles and privileges are read from the DB (UserRolesMapping,
 * RolePrivilegesMapping), not from the token. Use after JwtAuthGuard.
 */
@Injectable()
export class ConnectAdminGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const tenantId = request.headers?.tenantid;
    if (!isUUID(userId) || !isUUID(tenantId)) {
      throw new ForbiddenException(CONNECT_ERRORS.ADMIN_ONLY.message);
    }

    const access = await this.loadAccess(tenantId, userId);
    if (access.isAdmin) return true;

    const allowed =
      this.reflector.getAllAndOverride<string[]>(CONNECT_ADMIN_PRIVILEGES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (allowed.some((code) => access.privileges.includes(code))) {
      return true;
    }
    throw new ForbiddenException(CONNECT_ERRORS.ADMIN_ONLY.message);
  }

  private async loadAccess(
    tenantId: string,
    userId: string
  ): Promise<AdminAccess> {
    const key = CONNECT_CACHE.ADMIN_KEY(tenantId, userId);
    try {
      const cached = await this.cacheService.get<AdminAccess>(key);
      if (cached) return cached;
    } catch {
      // cache is optional
    }

    const [row] = await this.dataSource.query(
      `WITH my_roles AS (
         SELECT urm."roleId", r."code"
           FROM "UserRolesMapping" urm
           JOIN "Roles" r ON r."roleId" = urm."roleId"
          WHERE urm."userId" = $1 AND urm."tenantId" = $2
       )
       SELECT
         EXISTS (SELECT 1 FROM my_roles WHERE "code" = ANY($3::text[])) AS "isAdmin",
         COALESCE(
           (SELECT array_agg(DISTINCT p."code")::text[]
              FROM "RolePrivilegesMapping" rpm
              JOIN "Privileges" p ON p."privilegeId" = rpm."privilegeId"
             WHERE rpm."roleId" IN (SELECT "roleId" FROM my_roles)
               AND (rpm."tenantId" = $2 OR rpm."tenantId" IS NULL)
               AND p."code" LIKE 'connect.%'),
           '{}'::text[]
         ) AS "privileges"`,
      [userId, tenantId, CONNECT_ADMIN_ROLE_CODES]
    );
    const access: AdminAccess = {
      isAdmin: row?.isAdmin === true,
      privileges: row?.privileges ?? [],
    };
    try {
      await this.cacheService.set(key, access, CONNECT_CACHE.ADMIN_TTL);
    } catch {
      // cache is optional
    }
    return access;
  }
}
