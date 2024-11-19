import { Body, Controller, Delete, Get, Patch, Post, Query, Req, Res, SerializeOptions, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ApiCreatedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { TenantCreateDto } from './dto/tenant-create.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FilesUploadService } from 'src/common/services/upload-file';
import { TenantUpdateDto } from './dto/tenant-update.dto';
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
    @UseInterceptors(FilesInterceptor('programImages', 10))
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async createTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Body() tenantCreateDto: TenantCreateDto,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        const uploadedFiles = [];

        // Loop through each file and upload it
        if (files && files.length > 0) {
            for (const file of files) {
                const uploadedFile = await this.filesUploadService.saveFile(file);
                uploadedFiles.push(uploadedFile);
            }

            // Assuming tenantCreateDto needs an array of file paths
            tenantCreateDto.programImages = uploadedFiles.map(file => file.filePath); // Adjust field as needed
        }

        return await this.tenantService.createTenants(request, tenantCreateDto, response);
    }

    //Update a tenant
    @Patch("/update")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @UseInterceptors(FilesInterceptor('programImages', 10))
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async updateTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Query("id") id: string,
        @Body() tenantUpdateDto: TenantUpdateDto,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        const uploadedFiles = [];

        // Loop through each file and upload it
        if (files && files.length > 0) {
            for (const file of files) {
                const uploadedFile = await this.filesUploadService.saveFile(file);
                uploadedFiles.push(uploadedFile);
            }
            // Assuming tenantCreateDto needs an array of file paths
            tenantUpdateDto.programImages = uploadedFiles.map(file => file.filePath); // Adjust field as needed
        }
        const tenantId = id;
        return await this.tenantService.updateTenants(request, tenantId, tenantUpdateDto, response);
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

}
