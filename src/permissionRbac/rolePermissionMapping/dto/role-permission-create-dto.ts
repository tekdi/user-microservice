export class RolePermissionCreateDto {
  roleTitle: string;
  module: string;
  apiPath: string;
  requestType: string;
  rolePermissionId?: string;
}
