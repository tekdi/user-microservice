import { Response } from "express";
import { UserTenantMappingDto, UpdateAssignTenantStatusDto } from "src/userTenantMapping/dto/user-tenant-mapping.dto";
export interface IServicelocatorAssignTenant {
  userTenantMapping(
    request: any,
    assignTenantMappingDto: UserTenantMappingDto,
    response: Response
  );
  
  getUserTenantMappings(
    userId: string,
    includeArchived: boolean,
    response: Response
  );

  updateAssignTenantStatus(
    request: any,
    userId: string,
    tenantId: string,
    updateStatusDto: UpdateAssignTenantStatusDto,
    response: Response
  );
}
