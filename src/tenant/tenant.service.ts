import { HttpStatus, Injectable } from '@nestjs/common';
import { Tenant, TenantStatus } from './entities/tenent.entity';
import { ILike, In, Repository } from 'typeorm';
import APIResponse from "src/common/responses/response";
import { InjectRepository } from '@nestjs/typeorm';
import { API_RESPONSES } from '@utils/response.messages';
import { APIID } from '@utils/api-id.config';
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { TenantUpdateDto } from './dto/tenant-update.dto';
import { Request, Response } from "express";
import { TenantSearchDTO } from './dto/tenant-search.dto';
import { TenantCreateDto } from './dto/tenant-create.dto';

@Injectable()
export class TenantService {
    constructor(
        @InjectRepository(Tenant)
        private tenantRepository: Repository<Tenant>,
    ) { }

    public async getTenants(request: Request, response: Response): Promise<Response> {
        const apiId = APIID.TENANT_LIST;
    
        try {
            const result = await this.tenantRepository.find({
                where: { status: TenantStatus.ACTIVE },
            });
    
            if (result.length === 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.NOT_FOUND,
                    API_RESPONSES.TENANT_NOT_FOUND,
                    HttpStatus.NOT_FOUND
                );
            }
    
            // Separate parents and children
            const parents: any[] = [];
            const childrenMap = new Map<string, any[]>();
            const tenantMap = new Map<string, any>();
    
            // Process all tenants to add role details and build maps
            for (const tenantData of result) {
                // Convert tenant entity to plain object
                const tenantObj = { ...tenantData };
    
                // Fetch roles only for child tenants (skip for parent tenants)
                if (tenantData.parentId) {
                    let query = `SELECT * FROM public."Roles" WHERE "tenantId" = '${tenantData.tenantId}'`;
                    let getRole = await this.tenantRepository.query(query);
    
                    if (getRole.length === 0) {
                        // fallback if tenant-specific roles not found
                        getRole = await this.tenantRepository.query(`SELECT * FROM public."Roles"`);
                    }
    
                    if (getRole.length > 0) {
                        tenantObj['role'] = getRole.map((roleData: any) => ({
                            roleId: roleData.roleId,
                            name: roleData.name,
                            code: roleData.code,
                        }));
                    } else {
                        tenantObj['role'] = null;
                    }
                } else {
                    // Parent tenant → skip role assignment
                    tenantObj['role'] = null;
                }
    
                tenantMap.set(tenantData.tenantId, tenantObj);
    
                // Group by parentId
                if (!tenantData.parentId) {
                    // This is a parent tenant
                    tenantObj['children'] = [];
                    parents.push(tenantObj);
                } else {
                    // This is a child tenant
                    if (!childrenMap.has(tenantData.parentId)) {
                        childrenMap.set(tenantData.parentId, []);
                    }
                    childrenMap.get(tenantData.parentId)!.push(tenantObj);
                }
            }
    
            // Attach children to their respective parents
            for (const parent of parents) {
                const children = childrenMap.get(parent.tenantId) || [];
                parent['children'] = children;
            }
    
            // Handle orphan children (whose parentId doesn’t exist)
            const orphanChildren: any[] = [];
            for (const [parentId, children] of childrenMap.entries()) {
                if (!tenantMap.has(parentId)) {
                    orphanChildren.push(...children);
                }
            }
    
            // Combine parents with children and orphan children
            const groupedResult = [...parents];
            if (orphanChildren.length > 0) {
                groupedResult.push(...orphanChildren);
            }
    
            return APIResponse.success(
                response,
                apiId,
                groupedResult,
                HttpStatus.OK,
                API_RESPONSES.TENANT_GET
            );
    
        } catch (error) {
            const errorMessage = error.message || API_RESPONSES.INTERNAL_SERVER_ERROR;
            LoggerUtil.error(
                `${API_RESPONSES.SERVER_ERROR}`,
                `Error: ${errorMessage}`,
                apiId
            );
    
            return APIResponse.error(
                response,
                apiId,
                API_RESPONSES.INTERNAL_SERVER_ERROR,
                errorMessage,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
    

    public async searchTenants(request: Request, tenantSearchDTO: TenantSearchDTO, response: Response): Promise<Response> {
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

                        case 'parentId':
                            // Handle parentId filter - can be null for parent tenants or a UUID for children
                            if (value === null || value === 'null') {
                                whereClause[key] = null;
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

            const totalCount = await this.tenantRepository.count({ where: whereClause });

            if (totalCount === 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.NOT_FOUND,
                    API_RESPONSES.TENANT_NOT_FOUND,
                    HttpStatus.NOT_FOUND
                );
            }

            return APIResponse.success(
                response,
                apiId,
                { getTenantDetails, totalCount },
                HttpStatus.OK,
                API_RESPONSES.TENANT_SEARCH_SUCCESS
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

    public async createTenants(tenantCreateDto: TenantCreateDto, response: Response): Promise<Response> {
        let apiId = APIID.TENANT_CREATE;
        try {
            // Parse JSON strings for params and contentFilter fields
            if (tenantCreateDto.params && typeof tenantCreateDto.params === 'string') {
                try {
                    tenantCreateDto.params = JSON.parse(tenantCreateDto.params);
                } catch (error) {
                    LoggerUtil.warn(`Failed to parse params field: ${error.message}`, apiId);
                }
            }
            
            if (tenantCreateDto.contentFilter && typeof tenantCreateDto.contentFilter === 'string') {
                try {
                    tenantCreateDto.contentFilter = JSON.parse(tenantCreateDto.contentFilter);
                } catch (error) {
                    LoggerUtil.warn(`Failed to parse contentFilter field: ${error.message}`, apiId);
                }
            }

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

            // Validate parentId if provided
            if (tenantCreateDto.parentId) {
                const parentTenant = await this.tenantRepository.findOne({
                    where: { tenantId: tenantCreateDto.parentId }
                });

                if (!parentTenant) {
                    return APIResponse.error(
                        response,
                        apiId,
                        API_RESPONSES.NOT_FOUND,
                        "Parent tenant not found",
                        HttpStatus.NOT_FOUND
                    );
                }
            }

            let result = await this.tenantRepository.save(tenantCreateDto);
            if (result) {
                return APIResponse.success(
                    response,
                    apiId,
                    result,
                    HttpStatus.CREATED,
                    API_RESPONSES.TENANT_CREATE
                );
            }
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


    public async deleteTenants(request: Request, tenantId: string, response: Response) {
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

            // Check if this tenant has children
            const children = await this.tenantRepository.find({
                where: {
                    "parentId": tenantId
                }
            });

            if (children.length > 0) {
                return APIResponse.error(
                    response,
                    apiId,
                    API_RESPONSES.CONFLICT,
                    "Cannot delete tenant with child tenants. Please delete or reassign child tenants first.",
                    HttpStatus.CONFLICT
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
            // Parse JSON strings for params and contentFilter fields
            if (tenantUpdateDto.params && typeof tenantUpdateDto.params === 'string') {
                try {
                    tenantUpdateDto.params = JSON.parse(tenantUpdateDto.params);
                } catch (error) {
                    LoggerUtil.warn(`Failed to parse params field: ${error.message}`, apiId);
                }
            }
            
            if (tenantUpdateDto.contentFilter && typeof tenantUpdateDto.contentFilter === 'string') {
                try {
                    tenantUpdateDto.contentFilter = JSON.parse(tenantUpdateDto.contentFilter);
                } catch (error) {
                    LoggerUtil.warn(`Failed to parse contentFilter field: ${error.message}`, apiId);
                }
            }

            let checkExistingTenant = await this.tenantRepository.findOne({
                where: { tenantId }
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

            if (tenantUpdateDto.name) {
                const checkExistingTenantName = await this.tenantRepository.findOne({
                    where: {
                        "name": tenantUpdateDto.name
                    }
                })
                if (checkExistingTenantName && checkExistingTenantName.tenantId !== tenantId) {
                    return APIResponse.error(
                        response,
                        apiId,
                        API_RESPONSES.CONFLICT,
                        API_RESPONSES.TENANT_EXISTS,
                        HttpStatus.CONFLICT
                    );
                }
            }

            // Validate parentId if provided
            if (tenantUpdateDto.parentId !== undefined) {
                // Prevent self-reference
                if (tenantUpdateDto.parentId === tenantId) {
                    return APIResponse.error(
                        response,
                        apiId,
                        API_RESPONSES.CONFLICT,
                        "A tenant cannot be its own parent",
                        HttpStatus.CONFLICT
                    );
                }

                // If parentId is not null, validate it exists
                if (tenantUpdateDto.parentId) {
                    const parentTenant = await this.tenantRepository.findOne({
                        where: { tenantId: tenantUpdateDto.parentId }
                    });

                    if (!parentTenant) {
                        return APIResponse.error(
                            response,
                            apiId,
                            API_RESPONSES.NOT_FOUND,
                            "Parent tenant not found",
                            HttpStatus.NOT_FOUND
                        );
                    }

                    // Prevent circular reference: check if the proposed parent is a descendant of this tenant
                    // (i.e., if this tenant is anywhere in the parent chain of the proposed parent)
                    let currentParentId = tenantUpdateDto.parentId;
                    const visitedTenants = new Set<string>();
                    visitedTenants.add(tenantId); // Prevent checking the tenant itself

                    while (currentParentId) {
                        // If we've already visited this tenant, we have a circular reference
                        if (visitedTenants.has(currentParentId)) {
                            return APIResponse.error(
                                response,
                                apiId,
                                API_RESPONSES.CONFLICT,
                                "Circular reference detected: cannot set parent that would create a circular hierarchy",
                                HttpStatus.CONFLICT
                            );
                        }

                        // If the proposed parent is the current tenant, it's a circular reference
                        if (currentParentId === tenantId) {
                            return APIResponse.error(
                                response,
                                apiId,
                                API_RESPONSES.CONFLICT,
                                "Circular reference detected: cannot set parent that is a descendant of this tenant",
                                HttpStatus.CONFLICT
                            );
                        }

                        visitedTenants.add(currentParentId);

                        // Get the parent of the current parent to check further up the chain
                        const currentParent = await this.tenantRepository.findOne({
                            where: { tenantId: currentParentId }
                        });

                        if (!currentParent || !currentParent.parentId) {
                            break; // Reached the top of the hierarchy
                        }

                        currentParentId = currentParent.parentId;
                    }
                }
            }

            let result = await this.tenantRepository.update(tenantId, tenantUpdateDto);
            if (result && result.affected && result.affected > 0) {
                return APIResponse.success(
                    response,
                    apiId,
                    { tenantId, updatedFields: tenantUpdateDto },  // Return updated tenant information
                    HttpStatus.OK,
                    API_RESPONSES.TENANT_UPDATE
                );
            }

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
