import { Response } from "express";
import { CreatePrivilegeRoleDto } from "src/rbac/assign-privilege/dto/create-assign-privilege.dto";

export interface IServicelocatorprivilegeRole {
  createPrivilegeRole(
    request: any,
    createPrivilegeRole: CreatePrivilegeRoleDto,
    response: Response,
  );
  getPrivilegeRole(userId, request, response: Response);
}
