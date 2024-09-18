import { Controller, Get, Post, Req, Res, SerializeOptions } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';

@Controller('tenant')
export class TenantController {
    constructor(
        private tenantService: TenantService,
    ) { }
    //Get Field Option
    @Get("/read")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async getFieldOptions(
        @Req() request: Request,
        @Res() response: Response
    ) {
        return await this.tenantService.getTenants(request, response);
    }
}
