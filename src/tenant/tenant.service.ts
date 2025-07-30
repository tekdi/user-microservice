import { HttpStatus, Injectable } from "@nestjs/common";
import { CacheService } from "src/cache/cache.service";
import { createHash } from "crypto";
import { Tenant } from "./entities/tenent.entity";
import { ILike, In, Repository } from "typeorm";
import APIResponse from "src/common/responses/response";
import { InjectRepository } from "@nestjs/typeorm";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { TenantUpdateDto } from "./dto/tenant-update.dto";
import { Request, Response } from "express";
import { TenantSearchDTO } from "./dto/tenant-search.dto";
import { TenantCreateDto } from "./dto/tenant-create.dto";

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private readonly cacheService: CacheService,
  ) {}

  public async getTenants(
    request: Request,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.TENANT_LIST;
    try {

      // Try cache first
      const cacheKey = "tenants:all";
      const cachedResult = await this.cacheService.get<any[]>(cacheKey);
      if (cachedResult) {
        return APIResponse.success(
          response,
          apiId,
          cachedResult,
          HttpStatus.OK,
          API_RESPONSES.TENANT_GET,
        );
      }

      let result = await this.tenantRepository.find({
        where: { status: "published" },
      });

      if (result.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TENANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      // Add role details (only when we fetched from DB)
      for (const tenantData of result) {
        const query = `SELECT * FROM public."Roles" WHERE "tenantId" = '${tenantData.tenantId}'`;
        let getRole = await this.tenantRepository.query(query);

        if (getRole.length == 0) {
          const query = `SELECT * FROM public."Roles"`;
          getRole = await this.tenantRepository.query(query);
        }

        // Add role details to the tenantData object
        const roleDetails = [];
        if (getRole.length == 0) {
          tenantData["role"] = null;
        }

        for (const roleData of getRole) {
          roleDetails.push({
            roleId: roleData.roleId,
            name: roleData.name,
            code: roleData.code,
          });
          tenantData["role"] = roleDetails;
        }
      }

      // Cache the result
      await this.cacheService.set(cacheKey, result, 3 * 60 * 60); // 3 hours TTL

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.TENANT_GET,
      );
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async searchTenants(
    request: Request,
    tenantSearchDTO: TenantSearchDTO,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.TENANT_SEARCH;
    try {
      const { limit, offset, filters } = tenantSearchDTO;

      // Generate cache key based on search DTO
      const hash = createHash("md5")
        .update(JSON.stringify({ limit, offset, filters }))
        .digest("hex");
      const cacheKey = `tenants:search:${hash}`;

      let cached = await this.cacheService.get<{ getTenantDetails: any[]; totalCount: number }>(cacheKey);
      if (cached) {
        return APIResponse.success(
          response,
          apiId,
          cached,
          HttpStatus.OK,
          API_RESPONSES.TENANT_SEARCH_SUCCESS,
        );
      }

      const whereClause: Record<string, any> = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          switch (key) {
            case "name":
              whereClause[key] = ILike(`%${value}%`);
              break;

            case "status":
              if (Array.isArray(value)) {
                whereClause[key] = In(value);
              } else {
                whereClause[key] = value;
              }
              break;

            default:
              if (value !== undefined && value !== null) {
                whereClause[key] = value;
              }
              break;
          }
        });
      }

      const getTenantDetails = await this.tenantRepository.find({
        where: whereClause,
        take: limit || 10,
        skip: offset || 0,
      });

      const totalCount = await this.tenantRepository.count({
        where: whereClause,
      });

      if (totalCount === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TENANT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const successResponse = APIResponse.success(
        response,
        apiId,
        { getTenantDetails, totalCount },
        HttpStatus.OK,
        API_RESPONSES.TENANT_SEARCH_SUCCESS,
      );

      // Cache for 60 minutes
      await this.cacheService.set(cacheKey, { getTenantDetails, totalCount }, 60 * 60);

      return successResponse;
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async createTenants(
    tenantCreateDto: TenantCreateDto,
    response: Response,
  ): Promise<Response> {
    const apiId = APIID.TENANT_CREATE;
    try {
      // Parse JSON strings for params and contentFilter fields
      if (
        tenantCreateDto.params &&
        typeof tenantCreateDto.params === "string"
      ) {
        try {
          tenantCreateDto.params = JSON.parse(tenantCreateDto.params);
        } catch (error) {
          LoggerUtil.warn(
            `Failed to parse params field: ${error.message}`,
            apiId,
          );
        }
      }

      if (
        tenantCreateDto.contentFilter &&
        typeof tenantCreateDto.contentFilter === "string"
      ) {
        try {
          tenantCreateDto.contentFilter = JSON.parse(
            tenantCreateDto.contentFilter,
          );
        } catch (error) {
          LoggerUtil.warn(
            `Failed to parse contentFilter field: ${error.message}`,
            apiId,
          );
        }
      }

      const checkExitTenants = await this.tenantRepository.find({
        where: {
          name: tenantCreateDto?.name,
        },
      });
      if (checkExitTenants.length > 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TENANT_EXISTS,
          HttpStatus.CONFLICT,
        );
      }

      const result = await this.tenantRepository.save(tenantCreateDto);
      // Invalidate caches
      await this.cacheService.del("tenants:all");
      await this.cacheService.reset();
      if (result) {
        return APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.CREATED,
          API_RESPONSES.TENANT_CREATE,
        );
      }
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async deleteTenants(
    request: Request,
    tenantId: string,
    response: Response,
  ) {
    const apiId = APIID.TENANT_DELETE;
    try {
      const checkExitTenants = await this.tenantRepository.find({
        where: {
          tenantId: tenantId,
        },
      });
      if (checkExitTenants.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.TENANT_EXISTS,
          HttpStatus.CONFLICT,
        );
      }

      const result = await this.tenantRepository.delete(tenantId);

      // Invalidate caches
      if (result && result.affected && result.affected > 0) {
        await this.cacheService.del("tenants:all");
        await this.cacheService.reset();
      }

      if (result && result.affected && result.affected > 0) {
        return APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.OK,
          API_RESPONSES.TENANT_DELETE,
        );
      }
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async updateTenants(
    tenantId: string,
    tenantUpdateDto: TenantUpdateDto,
    response: Response,
  ) {
    const apiId = APIID.TENANT_UPDATE;
    try {
      // Parse JSON strings for params and contentFilter fields
      if (
        tenantUpdateDto.params &&
        typeof tenantUpdateDto.params === "string"
      ) {
        try {
          tenantUpdateDto.params = JSON.parse(tenantUpdateDto.params);
        } catch (error) {
          LoggerUtil.warn(
            `Failed to parse params field: ${error.message}`,
            apiId,
          );
        }
      }

      if (
        tenantUpdateDto.contentFilter &&
        typeof tenantUpdateDto.contentFilter === "string"
      ) {
        try {
          tenantUpdateDto.contentFilter = JSON.parse(
            tenantUpdateDto.contentFilter,
          );
        } catch (error) {
          LoggerUtil.warn(
            `Failed to parse contentFilter field: ${error.message}`,
            apiId,
          );
        }
      }

      const checkExistingTenant = await this.tenantRepository.findOne({
        where: { tenantId },
      });

      if (!checkExistingTenant) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TENANT_NOTFOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      if (tenantUpdateDto.name) {
        const checkExistingTenantName = await this.tenantRepository.findOne({
          where: {
            name: tenantUpdateDto.name,
          },
        });
        if (checkExistingTenantName) {
          return APIResponse.error(
            response,
            apiId,
            API_RESPONSES.CONFLICT,
            API_RESPONSES.TENANT_EXISTS,
            HttpStatus.CONFLICT,
          );
        }
      }

      const result = await this.tenantRepository.update(
        tenantId,
        tenantUpdateDto,
      );
      if (result && result.affected && result.affected > 0) {
        await this.cacheService.del("tenants:all");
        await this.cacheService.reset();
        return APIResponse.success(
          response,
          apiId,
          { tenantId, updatedFields: tenantUpdateDto }, // Return updated tenant information
          HttpStatus.OK,
          API_RESPONSES.TENANT_UPDATE,
        );
      }
    } catch (error) {
      const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
      LoggerUtil.error(
        `${API_RESPONSES.SERVER_ERROR}`,
        `Error: ${errorMessage}`,
        apiId,
      );
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
