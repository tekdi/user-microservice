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
}
