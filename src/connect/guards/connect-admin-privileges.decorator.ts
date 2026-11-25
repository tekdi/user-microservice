import { SetMetadata } from "@nestjs/common";

export const CONNECT_ADMIN_PRIVILEGES_KEY = "connectAdminPrivileges";

/**
 * On a /connect/admin/* route: besides the admin role, a role holding any of
 * these privilege codes (Privileges.code) may call it. Routes without this
 * decorator stay admin-role only. Read by ConnectAdminGuard.
 */
export const ConnectAdminPrivileges = (...codes: string[]) =>
  SetMetadata(CONNECT_ADMIN_PRIVILEGES_KEY, codes);
