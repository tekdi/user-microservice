import { Response } from "express";
import { UserTenantMappingDto } from "src/userTenantMapping/dto/user-tenant-mapping.dto";
export interface IServicelocatorAssignTenant {
  userTenantMapping(
    request: any,
    assignTenantMappingDto: UserTenantMappingDto,
    response: Response
  );
}
