import { Body, Controller, Delete, Get, Patch, Post, Query, Req, Res, SerializeOptions } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ApiCreatedResponse, ApiForbiddenResponse, ApiQuery } from '@nestjs/swagger';
import { TenantCreateDto } from './dto/tenant-create.dto';

@Controller('tenant')
export class TenantController {
    constructor(
        private tenantService: TenantService,
    ) { }
    //Get tenant information
    @Get("/read")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async getTenants(
        @Req() request: Request,
        @Res() response: Response
    ) {
        return await this.tenantService.getTenants(request, response);
    }

    //Create a new tenant
    @Post("/create")
    @ApiCreatedResponse({ description: "Tenant Created Successfully" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @SerializeOptions({
        strategy: "excludeAll",
    })
    @ApiQuery({ name: "userId", required: false, })
    public async createTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Body() tenantCreateDto: TenantCreateDto,
        @Query("userId") userId: string | null = null
    ) {
        return await this.tenantService.createTenants(request, userId, tenantCreateDto, response);
    }

    //Delete a tenant
    @Delete("/delete")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async deleteTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Query("id") id: string
    ) {
        const tenantId = id;
        return await this.tenantService.deleteTenants(request, tenantId, response);
    }


    //Update a tenant
    @Patch("/update")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async updateTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Query("id") id: string
    ) {
        const tenantId = id;
        return await this.tenantService.updateTenants(request, tenantId, response);
    }
}
