import {
  CreatePrivilegesDto,
  PrivilegeDto,
} from "src/rbac/privilege/dto/privilege.dto";
import { Response } from "express";

export interface IServicelocator {
  createPrivilege(
    loggedinUser: any,
    createPrivileges: CreatePrivilegesDto,
    response?: Response,
  );
  getPrivilege(privilegeId?: string, request?: any, response?: Response);
  // updatePrivilege(privilegeId, request, privilegeDto)
  getAllPrivilege(request: any, response?: Response);
  getPrivilegebyRoleId(
    tenantId: string,
    roleId: string,
    request: any,
    response?: Response,
  );
  // updatePrivilege(privilegeId, request, privilegeDto)
  deletePrivilege(privilegeId, response?: Response);
}
