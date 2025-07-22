import { CreateAssignRoleDto } from "src/rbac/assign-role/dto/create-assign-role.dto";
import { Response } from "express";
export interface IServicelocatorassignRole {
  createAssignRole(
    request: any,
    createAssignRoleDto: CreateAssignRoleDto,
    response: Response,
  );
  getAssignedRole(userId, request, response: Response);
  deleteAssignedRole(deleteAssignRoleDto, response: Response);
}
