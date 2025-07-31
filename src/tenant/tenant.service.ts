import { HttpStatus, Injectable } from '@nestjs/common';
import { Tenant } from './entities/tenent.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantConfigAudit } from './entities/tenant-config-audit.entity';
import { ILike, In, Repository } from 'typeorm';
import APIResponse from 'src/common/responses/response';
import { InjectRepository } from '@nestjs/typeorm';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { TenantUpdateDto } from './dto/tenant-update.dto';
import { CreateTenantConfigDto, UpdateTenantConfigDto } from './dto/tenant-config.dto';
import { Request, Response } from 'express';
import { TenantSearchDTO } from './dto/tenant-search.dto';
import { TenantCreateDto } from './dto/tenant-create.dto';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantConfig)
    private tenantConfigRepository: Repository<TenantConfig>,
    @InjectRepository(TenantConfigAudit)
    private tenantConfigAuditRepository: Repository<TenantConfigAudit>,
  ) {}

  public async getTenants(
    request: Request,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_LIST;
    try {
      let result = await this.tenantRepository.find({
        where: { status: 'published' },
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

      for (let tenantData of result) {
        let query = `SELECT * FROM public."Roles" WHERE "tenantId" = '${tenantData.tenantId}'`;

        const getRole = await this.tenantRepository.query(query);

        // Add role details to the tenantData object
        let roleDetails = [];
        for (let roleData of getRole) {
          roleDetails.push({
            roleId: roleData.roleId,
            name: roleData.name,
            code: roleData.code,
          });
          tenantData['role'] = roleDetails;
        }
      }

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
    let apiId = APIID.TENANT_SEARCH;
    try {
      const { limit, offset, filters } = tenantSearchDTO;

      const whereClause: Record<string, any> = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          switch (key) {
            case 'name':
              whereClause[key] = ILike(`%${value}%`);
              break;

            case 'status':
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

      return APIResponse.success(
        response,
        apiId,
        { getTenantDetails, totalCount },
        HttpStatus.OK,
        API_RESPONSES.TENANT_SEARCH_SUCCESS,
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

  public async createTenants(
    tenantCreateDto: TenantCreateDto,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CREATE;
    try {
      let checkExitTenants = await this.tenantRepository.find({
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

      let result = await this.tenantRepository.save(tenantCreateDto);
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
    let apiId = APIID.TENANT_DELETE;
    try {
      let checkExitTenants = await this.tenantRepository.find({
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

      let result = await this.tenantRepository.delete(tenantId);

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
    let apiId = APIID.TENANT_UPDATE;
    try {
      let checkExistingTenant = await this.tenantRepository.findOne({
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

      let result = await this.tenantRepository.update(
        tenantId,
        tenantUpdateDto,
      );
      if (result && result.affected && result.affected > 0) {
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

  // ========== TENANT CONFIGURATION METHODS ==========


  /**
   * Create configuration for a context
   */
  public async createTenantConfig(
    tenantId: string,
    context: string,
    configDto: CreateTenantConfigDto,
    changedBy: string,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CONFIG_CREATE;
    try {
      // Check if config already exists
      const existingConfig = await this.tenantConfigRepository.findOne({
        where: { tenantId, context },
      });

      if (existingConfig) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.CONFLICT,
          API_RESPONSES.CONFIGURATION_ALREADY_EXISTS_FOR_CONTEXT + context,
          HttpStatus.CONFLICT,
        );
      }

      // Prepare config data
      const configData = {
        tenantId,
        context,
        config: configDto.config,
        version: configDto.version || 1,
        expiresAt: configDto.expiresAt ? new Date(configDto.expiresAt) : null,
      };

      // Save new config
      const savedConfig = await this.tenantConfigRepository.save(configData);

      // Create audit log
      await this.createAuditLog(tenantId, context, changedBy, null, configDto.config);

      return APIResponse.success(
        response,
        apiId,
        savedConfig,
        HttpStatus.CREATED,
        API_RESPONSES.TENANT_CONFIG_CREATED_SUCCESSFULLY,
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

  /**
   * Update configuration for a context
   */
  public async updateTenantConfig(
    tenantId: string,
    context: string,
    configDto: UpdateTenantConfigDto,
    changedBy: string,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CONFIG_UPDATE;
    try {
      // Check if config exists
      const existingConfig = await this.tenantConfigRepository.findOne({
        where: { tenantId, context },
      });

      if (!existingConfig) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.CONFIGURATION_NOT_FOUND_FOR_CONTEXT + context,
          HttpStatus.NOT_FOUND,
        );
      }

      const oldConfig = { ...existingConfig.config };

      // Prepare config data
      const configData = {
        ...existingConfig,
        config: configDto.config,
        version: configDto.version || existingConfig.version + 1,
        expiresAt: configDto.expiresAt ? new Date(configDto.expiresAt) : existingConfig.expiresAt,
      };

      // Update config
      const savedConfig = await this.tenantConfigRepository.save(configData);

      // Create audit log
      await this.createAuditLog(tenantId, context, changedBy, oldConfig, configDto.config);

      return APIResponse.success(
        response,
        apiId,
        savedConfig,
        HttpStatus.OK,
        API_RESPONSES.TENANT_CONFIG_UPDATED_SUCCESSFULLY,
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


  /**
   * Get all configurations for a tenant
   */
  public async getTenantConfigs(
    tenantId: string,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CONFIG_LIST;
    try {
      const configs = await this.tenantConfigRepository.find({
        where: { tenantId },
        order: { context: 'ASC' },
      });

      if (configs.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.TENANT_CONFIG_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      return APIResponse.success(
        response,
        apiId,
        { configs: configs, totalCount: configs.length },
        HttpStatus.OK,
        API_RESPONSES.TENANT_CONFIG_RETRIEVED_SUCCESSFULLY,
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

  /**
   * Get configuration for a specific context
   */
  public async getTenantConfigByContext(
    tenantId: string,
    context: string,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CONFIG_GET;
    try {
      const config = await this.tenantConfigRepository.findOne({
        where: { tenantId, context },
      });

      if (!config) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.CONFIGURATION_NOT_FOUND_FOR_CONTEXT + context,
          HttpStatus.NOT_FOUND,
        );
      }

      // Process config to handle storage_provider references
      const processedConfig = await this.processConfigWithStorageProvider(tenantId, config);

      return APIResponse.success(
        response,
        apiId,
        processedConfig,
        HttpStatus.OK,
        API_RESPONSES.TENANT_CONFIG_RETRIEVED_SUCCESSFULLY,
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
  /**
   * Delete configuration for a context
   */
  public async deleteTenantConfig(
    tenantId: string,
    context: string,
    changedBy: string,
    response: Response,
  ): Promise<Response> {
    let apiId = APIID.TENANT_CONFIG_DELETE;
    try {
      const existingConfig = await this.tenantConfigRepository.findOne({
        where: { tenantId, context },
      });

      if (!existingConfig) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.NOT_FOUND,
          API_RESPONSES.CONFIGURATION_NOT_FOUND_FOR_CONTEXT + context,
          HttpStatus.NOT_FOUND,
        );
      }

      // Create audit log before deletion
      await this.createAuditLog(tenantId, context, changedBy, existingConfig.config, null);

      // Delete the config
      await this.tenantConfigRepository.remove(existingConfig);

      return APIResponse.success(
        response,
        apiId,
        { message: API_RESPONSES.TENANT_CONFIG_DELETED_SUCCESSFULLY },
        HttpStatus.OK,
        API_RESPONSES.TENANT_CONFIG_DELETED_SUCCESSFULLY,
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

  /**
   * Process config to handle storage_provider references
   */
  private async processConfigWithStorageProvider(tenantId: string, config: TenantConfig): Promise<TenantConfig> {
    const processedConfig = { ...config };
    
    // Check if config has storage_provider and context is not already a storage context
    if (config.config?.storage_provider && !config.context.startsWith('storage.')) {
      const storageProvider = config.config.storage_provider;
      const storageContext = `storage.${storageProvider}`;
      
      // Find the storage configuration
      const storageConfig = await this.tenantConfigRepository.findOne({
        where: { tenantId, context: storageContext },
      });

      if (storageConfig) {
        // Merge storage config with the original config
        processedConfig.config = {
          ...processedConfig.config,
          ...storageConfig.config,
        };
      }
    }

    return processedConfig;
  }
  /**
   * Create audit log entry
   */
  private async createAuditLog(
    tenantId: string,
    context: string,
    changedBy: string,
    oldConfig: Record<string, any> | null,
    newConfig: Record<string, any> | null,
  ): Promise<void> {
    const auditLog = this.tenantConfigAuditRepository.create({
      tenantId,
      context,
      changedBy,
      oldConfig,
      newConfig,
    });

    await this.tenantConfigAuditRepository.save(auditLog);
  }
}
