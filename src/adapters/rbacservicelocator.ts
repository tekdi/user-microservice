import { RoleSearchDto } from "../rbac/role/dto/role-search.dto";
import { CreateRolesDto, RoleDto } from "../rbac/role/dto/role.dto";
import { Response } from "express";

export interface IServicelocatorRbac {
  getRole(roleId?: string, request?: any, response?: Response);
  updateRole(id?: string, request?: any, userDto?: any, response?: Response);
  createRole(request: any, createRolesDto: CreateRolesDto, response?: Response);
  searchRole(roleSearchDto: RoleSearchDto, response: Response);
  deleteRole(roleId?: string, response?: Response);
}
