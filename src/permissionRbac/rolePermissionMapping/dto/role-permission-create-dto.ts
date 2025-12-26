export class RolePermissionCreateDto {
  roleTitle: string;
  module: string;
  apiPath: string;
  requestType: string[];
  rolePermissionId?: string;

  constructor(obj: any) {
    Object.assign(this, obj);
    // Normalize requestType: convert string to array, keep array as is
    const originalRequestType = obj?.requestType;
    if (originalRequestType !== undefined && originalRequestType !== null) {
      this.requestType = Array.isArray(originalRequestType) 
        ? originalRequestType 
        : [originalRequestType];
    }
  }
}
