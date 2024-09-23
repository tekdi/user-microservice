import { HttpStatus, Injectable } from '@nestjs/common';
import { Tenants } from './entities/tenent.entity';
import { Repository } from 'typeorm';
import APIResponse from "src/common/responses/response";
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TenantService {
    constructor(
        @InjectRepository(Tenants)
        private tenantRepository: Repository<Tenants>,
    ) { }

    public async getTenants(request, response) {
        let apiId = "getTenantData";
        try {
            let result = await this.tenantRepository.find();
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                "Tenant fetched successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "INTERNAL_SERVER_ERROR",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

    }

    public async createTenants(request, tenantCreateDto, response) {
        let apiId = "createTenant";
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
                    "Tenant already exists",
                    "CONFLICT",
                    HttpStatus.CONFLICT
                );
            }
            let result = await this.tenantRepository.save(tenantCreateDto);
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.CREATED,
                "Tenant created successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "INTERNAL_SERVER_ERROR",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    public async deleteTenants(request, tenantId, response) {
        let apiId = "deleteTenant";
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
                    "Tenant is not exists",
                    "CONFLICT",
                    HttpStatus.CONFLICT
                );
            }

            let result = await this.tenantRepository.delete(tenantId);
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                "Tenant deleted successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "INTERNAL_SERVER_ERROR",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    public async updateTenants(request, tenantId, response) {
        let apiId = "updateTenant";
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
                    "Tenant is not exists",
                    "CONFLICT",
                    HttpStatus.CONFLICT
                );
            }

            let result = await this.tenantRepository.update(
                tenantId,
                request.body
            );
            return APIResponse.success(
                response,
                apiId,
                result,
                HttpStatus.OK,
                "Tenant updated successfully."
            );
        } catch (error) {
            const errorMessage = error.message || "Internal server error";
            return APIResponse.error(
                response,
                apiId,
                "INTERNAL_SERVER_ERROR",
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

    }
}
