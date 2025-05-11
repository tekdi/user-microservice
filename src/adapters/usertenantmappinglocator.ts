import { Response } from "express";
import { UserOrgTenantMappingDto } from "src/userTenantMapping/dto/user-tenant-mapping.dto";
export interface IServicelocatorAssignTenant {
  userTenantMapping(
    request: any,
    assignTenantMappingDto: UserOrgTenantMappingDto,
    response: Response
  );
}
