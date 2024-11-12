import { Body, Controller, Delete, Get, Patch, Post, Query, Req, Res, SerializeOptions, UploadedFile, UseInterceptors } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { TenantCreateDto } from './dto/tenant-create.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesUploadService } from 'src/common/services/upload-file';
@Controller('tenant')
export class TenantController {
    constructor(
        private tenantService: TenantService,
        private readonly filesUploadService: FilesUploadService
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
    @UseInterceptors(FileInterceptor('programImage'))
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async createTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Body() tenantCreateDto: TenantCreateDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (file) {
            const uploadedFile = await this.filesUploadService.saveFile(file);
            console.log(uploadedFile);

            tenantCreateDto.programImage = uploadedFile.filePath;
        }
        console.log(tenantCreateDto);

        return await this.tenantService.createTenants(request, tenantCreateDto, response);
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
