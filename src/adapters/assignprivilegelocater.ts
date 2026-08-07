import { Response } from "express";
import { CreatePrivilegeRoleDto } from "src/rbac/assign-privilege/dto/create-assign-privilege.dto";
import { UpdateRolePrivilegesDto } from "src/rbac/assign-privilege/dto/update-assign-privilege.dto";

export interface IServicelocatorprivilegeRole {
  createPrivilegeRole(
    request: any,
    createPrivilegeRole: CreatePrivilegeRoleDto,
    response: Response
  );
  getPrivilegeRole(userId, request, response: Response);
  getGroupedPermissionsForRole(roleId: string, response: Response);
  deletePrivilegeFromRole(roleId: string, privilegeId: string, response: Response);
  updateRolePrivileges(
    roleId: string,
    dto: UpdateRolePrivilegesDto,
    response: Response
  );
}
