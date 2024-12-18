import { HttpStatus, Injectable } from '@nestjs/common';
import { Tenant } from './entities/tenent.entity';
import { Repository } from 'typeorm';
import APIResponse from "src/common/responses/response";
import { InjectRepository } from '@nestjs/typeorm';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { TenantUpdateDto } from './dto/tenant-update.dto';
import { Response } from "express";

@Injectable()
export class TenantService {
    constructor(
        @InjectRepository(Tenant)
        private tenantRepository: Repository<Tenant>,
    ) { }

    public async getTenants(request, response) {
        let apiId = APIID.TENANT_LIST;
        try {
            let result = await this.tenantRepository.find({ where: { status: "active" } });

            if (result.length === 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.NOT_FOUND,
                    API_RESPONSES.TENANT_NOT_FOUND,
                    HttpStatus.NOT_FOUND
                );
            }

            for (let tenantData of result) {
                let query = `SELECT * FROM public."Roles" WHERE "tenantId" = '${tenantData.tenantId}'`;

                const getRole = await this.tenantRepository.query(query);

                // Add role details to the tenantData object
                let roleDetails = [];
                for (let roleData of getRole) {

                    roleDetails.push({
                        roleId: roleData.roleId,
                        name: roleData.name,
                        code: roleData.code
                    });
                    tenantData['role'] = roleDetails;
                }

            }

            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                API_RESPONSES.TENANT_GET
            );
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            LoggerUtil.error(
                `${API_RESPONSES.SERVER_ERROR}`,
                `Error: ${errorMessage}`,
                apiId
            )
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


    public async createTenants(request, tenantCreateDto, response) {
        let apiId = APIID.TENANT_CREATE;
        try {
            let checkExitTenants = await this.tenantRepository.find({
                where: {
                    "name": tenantCreateDto?.name
                }
            }
            )
            if (checkExitTenants.length > 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.CONFLICT,
                    API_RESPONSES.TENANT_EXISTS,
                    HttpStatus.CONFLICT
                );
            }

            let result = await this.tenantRepository.save(tenantCreateDto);
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.CREATED,
                API_RESPONSES.TENANT_CREATE
            );
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            LoggerUtil.error(
                `${API_RESPONSES.SERVER_ERROR}`,
                `Error: ${errorMessage}`,
                apiId
            )
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    public async deleteTenants(request, tenantId, response) {
        let apiId = APIID.TENANT_DELETE;
        try {
            let checkExitTenants = await this.tenantRepository.find({
                where: {
                    "tenantId": tenantId
                }
            }
            )
            if (checkExitTenants.length === 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.CONFLICT,
                    API_RESPONSES.TENANT_EXISTS,
                    HttpStatus.CONFLICT
                );
            }

            let result = await this.tenantRepository.delete(tenantId);
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                API_RESPONSES.TENANT_DELETE,
            );
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            LoggerUtil.error(
                `${API_RESPONSES.SERVER_ERROR}`,
                `Error: ${errorMessage}`,
                apiId
            )
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    public async updateTenants(tenantId: string, tenantUpdateDto: TenantUpdateDto, response: Response) {
        let apiId = APIID.TENANT_UPDATE;
        try {
            let checkExistingTenantName;
            let checkExistingTenant = await this.tenantRepository.findOne({
                where: {tenantId}
            })
            
            if (!checkExistingTenant) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.NOT_FOUND,
                    API_RESPONSES.TENANT_NOTFOUND,
                    HttpStatus.NOT_FOUND
                );
            }

            if(tenantUpdateDto.name){
                checkExistingTenantName = await this.tenantRepository.findOne({
                    where: {
                        "name": tenantUpdateDto.name
                    }
                })
            }
            
            if (checkExistingTenantName) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.CONFLICT,
                    API_RESPONSES.TENANT_EXISTS,
                    HttpStatus.CONFLICT
                );
            }

            let result = await this.tenantRepository.update(tenantId, tenantUpdateDto);
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                API_RESPONSES.TENANT_UPDATE
            );
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            LoggerUtil.error(
                `${API_RESPONSES.SERVER_ERROR}`,
                `Error: ${errorMessage}`,
                apiId
            )
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}
