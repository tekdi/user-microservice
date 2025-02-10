import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, SerializeOptions, UploadedFiles, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ApiCreatedResponse, ApiForbiddenResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TenantCreateDto } from './dto/tenant-create.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FilesUploadService } from 'src/common/services/upload-file';
import { TenantUpdateDto } from './dto/tenant-update.dto';
import { Request, Response } from "express";
import { TenantSearchDTO } from './dto/tenant-search.dto';
import { API_RESPONSES } from '@utils/response.messages';
import { isUUID } from 'class-validator';
import { GetUserId } from 'src/common/decorators/getUserId.decorator';

@ApiTags("Tenant")
@Controller('tenant')
export class TenantController {
    constructor(
        private tenantService: TenantService,
        private readonly filesUploadService: FilesUploadService
    ) { }
    //Get tenant information
    @Get("/read")
    @ApiCreatedResponse({ description: API_RESPONSES.TENANT_SEARCH_SUCCESS })
    @ApiForbiddenResponse({ description: API_RESPONSES.FORBIDDEN })
    @UsePipes(ValidationPipe)
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async getTenants(
        @Req() request: Request,
        @Res() response: Response
    ): Promise<Response>{
        return await this.tenantService.getTenants(request, response);
    }

    //Search Tenanr deatils
    @Post("/search")
    @ApiCreatedResponse({ description: API_RESPONSES.TENANT_SEARCH_SUCCESS })
    @ApiForbiddenResponse({ description: API_RESPONSES.FORBIDDEN })
    @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
    public async searchTenants(
        @Body() tenantSearchDTO: TenantSearchDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<Response> {
        return this.tenantService.searchTenants(request, tenantSearchDTO, response);
    }


    //Create a new tenant
    @Post("/create")
    @ApiCreatedResponse({ description: API_RESPONSES.TENANT_CREATE })
    @ApiForbiddenResponse({ description: API_RESPONSES.FORBIDDEN })
    @UseInterceptors(FilesInterceptor('programImages', 10))
    @UsePipes(ValidationPipe)
    public async createTenants(
        @Res() response: Response,
        @Body() tenantCreateDto: TenantCreateDto,
        @UploadedFiles() files: Express.Multer.File[],
        @GetUserId("userId", ParseUUIDPipe) userId: string,
    ): Promise<Response> {
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
        tenantCreateDto.createdBy = userId;
        return await this.tenantService.createTenants(tenantCreateDto, response);
    }

    //Update a tenant
    @Patch("/update/:id")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @UseInterceptors(FilesInterceptor('programImages', 10))
    @UsePipes(ValidationPipe)
    public async updateTenants(
        @Res() response: Response,
        @Param("id", new ParseUUIDPipe()) id: string,
        @Body() tenantUpdateDto: TenantUpdateDto,
        @UploadedFiles() files: Express.Multer.File[],
        @GetUserId("userId", ParseUUIDPipe) userId: string,
    ): Promise<Response> {
        const tenantId = id;        
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
        tenantUpdateDto.updatedBy = userId;
        return await this.tenantService.updateTenants(tenantId, tenantUpdateDto, response);
    }


    //Delete a tenant
    @Delete("/delete")
    @ApiCreatedResponse({ description: "Tenant Data Fetch" })
    @ApiForbiddenResponse({ description: "Forbidden" })
    @UsePipes(ValidationPipe)
    @SerializeOptions({
        strategy: "excludeAll",
    })
    public async deleteTenants(
        @Req() request: Request,
        @Res() response: Response,
        @Param("id", new ParseUUIDPipe()) id: string,
        @GetUserId("userId", ParseUUIDPipe) userId: string,
    ) {
        const tenantId = id;        
        return await this.tenantService.deleteTenants(request, tenantId, response);
    }

}
