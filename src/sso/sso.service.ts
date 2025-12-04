import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '../common/utils/http-service';
import { SsoRequestDto } from './dto/sso-request.dto';
import { UserCreateDto } from '../user/dto/user-create.dto';
import { UserAdapter } from '../user/useradapter';
import { PostgresRoleService } from '../adapters/postgres/rbac/role-adapter';
import { PostgresUserService } from '../adapters/postgres/user-adapter';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import { SSO_DEFAULTS } from '../constants/sso.constants';
import { PostgresAssignTenantService } from 'src/adapters/postgres/userTenantMapping-adapter';


interface NewtonApiResponse {
  success: boolean;
  redirectUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  isNewUser?: boolean;
  email?: string;
  name?: string;
  userId?: string;
  message: string;
  newtonData?: Record<string, any>;
}

interface StandardApiResponse {
  id: string;
  ver: string;
  ts: string;
  params: {
    resmsgid: string;
    status: string;
    err: null;
    errmsg: null;
    successmessage: string;
  };
  responseCode: number;
  result: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    token_type: string;
  };
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly newtonApiEndpoint: string;
  private readonly newtonApiTimeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly userAdapter: UserAdapter,
    private readonly postgresRoleService: PostgresRoleService,
    private readonly postgresUserService: PostgresUserService,
    private readonly postgresFieldsService: PostgresFieldsService,
    private readonly postgresAssignTenantService: PostgresAssignTenantService
  ) {
    // Configuration from environment variables
    this.newtonApiEndpoint =this.configService.get<string>('KEYCLOAK')
    this.newtonApiTimeout = this.configService.get<number>('NEWTON_API_TIMEOUT') || 30000;
  }

  /**
   * Main SSO authentication method
   * @param ssoRequestDto - SSO request data
   * @returns Standard API response format for both new and existing users
   */
  async authenticate(ssoRequestDto: SsoRequestDto): Promise<StandardApiResponse> {
    try {
      this.logger.log(`Starting SSO authentication for provider: ${ssoRequestDto.ssoProvider}`, 'SSO_SERVICE');
      
      // Step 1: Validate tenantId if provided, otherwise apply default
      if (ssoRequestDto.tenantId) {
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(ssoRequestDto.tenantId)) {
          throw new HttpException('Please enter valid Tenant UUID In URL', HttpStatus.BAD_REQUEST);
        }
        this.logger.log(`Using provided tenant ID: ${ssoRequestDto.tenantId}`, 'SSO_SERVICE');
      } else {
        ssoRequestDto.tenantId = SSO_DEFAULTS.DEFAULT_TENANT_ID;
        this.logger.log(`Using default tenant ID: ${SSO_DEFAULTS.DEFAULT_TENANT_ID}`, 'SSO_SERVICE');
      }
      
      if (!ssoRequestDto.roleId) {
        ssoRequestDto.roleId = SSO_DEFAULTS.DEFAULT_LEARNER_ROLE_ID;
        this.logger.log(`Using default learner role ID: ${SSO_DEFAULTS.DEFAULT_LEARNER_ROLE_ID}`, 'SSO_SERVICE');
      }
      
      // Step 2: Fetch role name from roleId before calling Newton API
      const roleName = await this.getRoleNameDirectly(ssoRequestDto.roleId);
      if (!roleName) {
        throw new HttpException('Role name not found. Please enter a valid Role ID', HttpStatus.NOT_FOUND);
      }
      this.logger.log(`Role name fetched for roleId ${ssoRequestDto.roleId}: ${roleName}`, 'SSO_SERVICE');
      
      // Populate roles in the DTO for consistency
      ssoRequestDto.roles = roleName;
      
      // Step 3: Call Newton API to authenticate and get user data (with roles)
      const newtonResponse = await this.callNewtonApi(ssoRequestDto, roleName);
      if (!newtonResponse.success) {
        throw new HttpException(
          `Newton API authentication failed: ${newtonResponse.message}`,
          HttpStatus.UNAUTHORIZED
        );
      }

      // Step 4: Check if user is existing or new
      if (!newtonResponse.isNewUser) {
        this.logger.log(`Existing user detected: ${newtonResponse.name}`, 'SSO_SERVICE');
        // Send response to client first
        const response = this.createStandardResponse(newtonResponse);
        
        // Update newtonData asynchronously in background (fire and forget)
        this.handleExistingUser(newtonResponse, ssoRequestDto).catch(error => {
          // Log error but don't block the response
          this.logger.error(
            `Background update of newtonData failed: ${error.message}`,
            error.stack,
            'SSO_SERVICE'
          );
        });
        
        return response;
      } else {
        this.logger.log(`New user detected: ${newtonResponse.name}`, 'SSO_SERVICE');
        await this.handleNewUser(newtonResponse, ssoRequestDto);
        return this.createStandardResponse(newtonResponse);
      }

    } catch (error) {
      this.logger.error(
        `SSO authentication failed: ${error.message}`,
        error.stack,
        'SSO_SERVICE'
      );
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'SSO authentication failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get role name from database using direct query
   * @param roleId - The role ID
   * @returns Promise<string> - Role name or empty string
   */
  private async getRoleNameDirectly(roleId: string): Promise<string> {
    try {
      const query = `SELECT "name" FROM public."Roles" WHERE "roleId" = $1`;
      const response = await this.postgresRoleService['roleRepository'].query(query, [roleId]);
      
      if (response.length > 0) {
        return response[0].name || '';
      }
      return '';
    } catch (error) {
      this.logger.error(`Failed to fetch role name for roleId ${roleId}: ${error.message}`, 'SSO_SERVICE');
      return '';
    }
  }

  /**
   * Call Newton API for authentication using form-urlencoded format with roles
   * @param ssoRequestDto - SSO request data
   * @param roleName - Role name fetched from roleId
   * @returns Newton API response
   */
  private async callNewtonApi(ssoRequestDto: SsoRequestDto, roleName: string): Promise<NewtonApiResponse> {
    try {
      this.logger.log(`Calling Newton API: ${this.newtonApiEndpoint}`, 'SSO_SERVICE');
      
      // Newton API expects form-urlencoded data with roles included
      const formData = new URLSearchParams();
      formData.append('userId', ssoRequestDto.userId);
      formData.append('access_token', ssoRequestDto.accessToken);
      formData.append('roles', roleName);

      this.logger.log(`Form data being sent to Newton API: userId=${ssoRequestDto.userId}, roles=${roleName}`, 'SSO_SERVICE');

      // Construct proper URL
      const fullUrl = this.newtonApiEndpoint.endsWith('/') 
        ? this.newtonApiEndpoint + 'realms/pratham/newton-login'
        : this.newtonApiEndpoint + '/realms/pratham/newton-login';

      this.logger.log(`Full Newton API URL: ${fullUrl}`, 'SSO_SERVICE');

      const response = await this.httpService.post<NewtonApiResponse>(
        fullUrl,
        formData.toString(),
        {
          timeout: this.newtonApiTimeout,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      if (response.status !== 200) {
        throw new HttpException(
          `Newton API returned status ${response.status}: ${response.statusText}`,
          HttpStatus.BAD_REQUEST
        );
      }

      this.logger.log(`Newton API response received successfully`, 'SSO_SERVICE');
      return response.data;

    } catch (error) {
      this.logger.error(
        `Newton API call failed: ${error.message}`,
        error.stack,
        'SSO_SERVICE'
      );
      
      // Return detailed error information for debugging
      if (error.response) {
        const errorDetails = {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url || 'unknown'
        };
        
        this.logger.error(`Newton API HTTP Error Details:`, JSON.stringify(errorDetails), 'SSO_SERVICE');
        
        throw new HttpException(
          `Newton API HTTP Error [${error.response.status}]: ${error.response.statusText}. Response: ${JSON.stringify(error.response.data)}`,
          HttpStatus.BAD_REQUEST
        );
      } else if (error.request) {
        this.logger.error(`Newton API Network Error: No response received`, 'SSO_SERVICE');
        throw new HttpException(
          'Newton API Network Error: No response received from server',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      } else if (error instanceof HttpException) {
        throw error;
      } else {
        this.logger.error(`Newton API Unknown Error: ${error.message}`, 'SSO_SERVICE');
        throw new HttpException(
          `Newton API Unknown Error: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }

  /**
   * Create standard API response format (Step 5 from workflow)
   * @param newtonResponse - Response from Newton API
   * @returns Standard API response format
   */
  private createStandardResponse(newtonResponse: NewtonApiResponse): StandardApiResponse {
    return {
      id: "api.login",
      ver: "1.0",
      ts: new Date().toISOString(),
      params: {
        resmsgid: this.generateUUID(),
        status: "successful",
        err: null,
        errmsg: null,
        successmessage: "Auth Token fetched Successfully."
      },
      responseCode: 200,
      result: {
        access_token: newtonResponse.accessToken || '',
        refresh_token: newtonResponse.refreshToken || '',
        expires_in: 86400, // 24 hours
        refresh_expires_in: 604800, // 7 days
        token_type: "Bearer"
      }
    };
  }

  /**
   * Handle new user creation using the actual user adapter method
   * @param newtonResponse - Response from Newton API
   * @param ssoRequestDto - Original SSO request
   */
  private async handleNewUser(
    newtonResponse: NewtonApiResponse,
    ssoRequestDto: SsoRequestDto
  ): Promise<void> {
    try {
      // Create user in local database using the actual user adapter method
      const userCreateDto = this.mapToUserCreateDto(newtonResponse, ssoRequestDto);
      // Create mock request object for the user adapter method
      const mockRequest = {
        headers: { authorization: null } // No JWT token for SSO users
      } as any;
      
      const createdUser = await this.postgresUserService.createUserInDatabase(
        mockRequest,
        userCreateDto
      );

      //Map User to Role and Tenant

      // Sanitize userId for use in custom fields
      const sanitizedNewtonUserId = this.sanitizeUUID(newtonResponse.userId) || createdUser.userId;

      // Update custom fields if newtonData is available
      if (newtonResponse.newtonData && Object.keys(newtonResponse.newtonData).length > 0) {
        for (const [fieldLabel, fieldValue] of Object.entries(newtonResponse.newtonData)) {
          if (fieldValue) {
            const fieldId = await this.postgresFieldsService.getFieldIdByLabel(fieldLabel, ssoRequestDto.tenantId);
            console.log("fieldId", fieldId);
            if (fieldId) {
              await this.postgresFieldsService.updateUserCustomFields(
                createdUser.userId, 
                { fieldId, value: fieldValue }, 
                null,
                {
                  tenantId: ssoRequestDto.tenantId,
                  contextType: "USER",
                  createdBy: sanitizedNewtonUserId,
                  updatedBy: sanitizedNewtonUserId
                }
              );
            }
          }
        }
      }
      // Map Manager Role as well
      if(newtonResponse.newtonData.IS_MANAGER?.toUpperCase() === 'YES'){
        const tenantsData = {
          userId: createdUser.userId,
          tenantRoleMapping: {
            tenantId: ssoRequestDto.tenantId,
            roleId: SSO_DEFAULTS.MANAGER_ROLE_ID
          }
        };
        await this.postgresUserService.assignUserToTenantAndRoll(tenantsData,tenantsData.userId, true)
      }
      this.postgresUserService.publishUserEvent('created', createdUser.userId, 'api.sso.service')
      this.logger.log(`New user created successfully: ${newtonResponse.name} with ID: ${createdUser.userId}`, 'SSO_SERVICE');
      this.postgresUserService.publishUserEvent('created', createdUser.userId, 'api.sso.service')
    } catch (error) {
      this.logger.error(
        `Failed to create new user: ${error.message}`,
        error.stack,
        'SSO_SERVICE'
      );
      
      throw new HttpException(
        'Failed to create user in database',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Sanitize and validate UUID by removing invalid characters
   * @param uuid - UUID string that may contain invalid characters
   * @returns Sanitized UUID string or null if invalid
   */
  private sanitizeUUID(uuid: string | undefined | null): string | null {
    if (!uuid || typeof uuid !== 'string') {
      return null;
    }

    // Remove any trailing/leading whitespace and invalid characters
    // UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // Remove any characters that are not valid UUID characters (hex digits and hyphens)
    let sanitized = uuid.trim();
    
    // Remove any trailing special characters (like asterisks, spaces, etc.)
    sanitized = sanitized.replace(/[^a-fA-F0-9-]+$/, '');
    
    // Remove any leading special characters
    sanitized = sanitized.replace(/^[^a-fA-F0-9]+/, '');
    
    // Remove any invalid characters within the UUID (keep only hex digits and hyphens)
    sanitized = sanitized.replace(/[^a-fA-F0-9-]/g, '');
    
    // Validate UUID format: should be 8-4-4-4-12 hex digits separated by hyphens
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(sanitized)) {
      return sanitized;
    }
    
    this.logger.warn(
      `Invalid UUID format after sanitization: ${uuid} -> ${sanitized}`,
      'SSO_SERVICE'
    );
    
    return null;
  }

  /**
   * Map Newton API response to UserCreateDto with name parsing
   * @param newtonResponse - Newton API response
   * @param ssoRequestDto - Original SSO request
   * @returns UserCreateDto for database creation
   */
  private mapToUserCreateDto(
    newtonResponse: NewtonApiResponse,
    ssoRequestDto: SsoRequestDto
  ){
    // Parse name from Newton response (e.g., "ADMIN-NEWTON" -> firstName: "ADMIN", lastName: "NEWTON")
    const { firstName, lastName } = this.parseFullName(newtonResponse.name || '');
    
    // Use newtonData if available, otherwise fallback to direct fields
    const userData = newtonResponse.newtonData || {
      USER_ID: newtonResponse.userId || '',
      EMP_NAME: newtonResponse.name || '',
      EMAIL: newtonResponse.email || ''
    };

    // Sanitize userId from Newton response or userData
    const rawUserId = newtonResponse.userId || userData.USER_ID;
    const sanitizedUserId = this.sanitizeUUID(rawUserId);
    
    if (!sanitizedUserId) {
      this.logger.error(
        `Invalid userId received from Newton API: ${rawUserId}. Cannot create user.`,
        'SSO_SERVICE'
      );
      throw new HttpException(
        `Invalid user ID format received from authentication service: ${rawUserId}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // Log if sanitization changed the value
    if (rawUserId !== sanitizedUserId) {
      this.logger.warn(
        `UserId sanitized: "${rawUserId}" -> "${sanitizedUserId}"`,
        'SSO_SERVICE'
      );
    }

    return {
      userId: sanitizedUserId,
      username: newtonResponse.email || userData.EMAIL,
      firstName: firstName,
      middleName: undefined,
      lastName: lastName,
      email: newtonResponse.email || userData.EMAIL,
      mobile: undefined,
      gender: undefined,
      dob: undefined,
      district: undefined,
      state: undefined,
      address: undefined,
      pincode: undefined,
      password: undefined, // No password for SSO users
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: sanitizedUserId, // Use the sanitized Newton user ID as creator
      updatedBy: sanitizedUserId, // Use the sanitized Newton user ID as updater
      customFields: [],
      automaticMember: undefined,
      tenantCohortRoleMapping: [{
        tenantId: ssoRequestDto.tenantId,
        cohortIds: [],
        roleId: ssoRequestDto.roleId
      }],
    };
  }

  /**
   * Parse full name into firstName and lastName
   * @param fullName - Full name string (e.g., "ADMIN-NEWTON")
   * @returns Object with firstName and lastName
   */
  private parseFullName(fullName: string): { firstName: string; lastName: string } {
    if (!fullName) {
      return { firstName: '', lastName: '' };
    }

    // Handle hyphenated names like "ADMIN-NEWTON"
    if (fullName.includes('-')) {
      const parts = fullName.split('-');
      return {
        firstName: parts[0].trim(),
        lastName: parts.slice(1).join('-').trim()
      };
    }

    // Handle space-separated names
    if (fullName.includes(' ')) {
      const parts = fullName.split(' ');
      return {
        firstName: parts[0].trim(),
        lastName: parts.slice(1).join(' ').trim()
      };
    }

    // Single name - use as firstName
    return {
      firstName: fullName.trim(),
      lastName: ''
    };
  }


  /**
   * Update or create newtonData fields in fieldvalues table
   * Uses updateCustomFields which handles both update and create scenarios
   * @param userId - User ID to update fields for
   * @param newtonData - Newton data object with field labels and values
   * @param updatedBy - User ID who is updating (from token or newton response)
   * @param tenantId - Tenant ID (uses default if not provided)
   */
  private async updateNewtonDataFields(
    userId: string,
    newtonData: Record<string, any> | undefined,
    updatedBy: string,
    tenantId?: string
  ): Promise<void> {
    try {
      // Use default tenantId if not provided
      const effectiveTenantId = tenantId || SSO_DEFAULTS.DEFAULT_TENANT_ID;

      if (!newtonData || Object.keys(newtonData).length === 0) {
        this.logger.log(`No newtonData to update for user: ${userId}`, 'SSO_SERVICE');
        return;
      }

      this.logger.log(
        `Updating newtonData fields for user: ${userId} in tenant: ${effectiveTenantId}`,
        'SSO_SERVICE'
      );

      for (const [fieldLabel, fieldValue] of Object.entries(newtonData)) {
        if (fieldValue) {
          const fieldId = await this.postgresFieldsService.getFieldIdByLabel(
            fieldLabel,
            effectiveTenantId
          );
          
          if (fieldId) {
            // Use updateCustomFields which handles both update and create (upsert behavior)
            await this.postgresFieldsService.updateCustomFields(
              userId,
              { fieldId, value: fieldValue },
              null, // fieldAttributesAndParams not needed for simple updates
              {
                tenantId: effectiveTenantId,
                contextType: "USER",
                createdBy: updatedBy,
                updatedBy: updatedBy
              }
            );
            this.logger.log(
              `Updated field ${fieldLabel} (${fieldId}) for user ${userId}`,
              'SSO_SERVICE'
            );
          } else {
            this.logger.warn(
              `Field label '${fieldLabel}' not found for tenant ${effectiveTenantId}`,
              'SSO_SERVICE'
            );
          }
        }
      }
      this.logger.log(
        `Successfully updated newtonData fields for user: ${userId}`,
        'SSO_SERVICE'
      );
    } catch (error) {
      this.logger.error(
        `Failed to update newtonData fields for user ${userId}: ${error.message}`,
        error.stack,
        'SSO_SERVICE'
      );
      // Don't throw - allow the SSO flow to continue even if field updates fail
    }
  }

  /**
   * Handle existing user - decode userId from token and update newtonData
   * @param newtonResponse - Response from Newton API
   * @param ssoRequestDto - Original SSO request
   */
  private async handleExistingUser(
    newtonResponse: NewtonApiResponse,
    ssoRequestDto: SsoRequestDto
  ): Promise<void> {
    try {
      // Decode userId from access token
      

      // Use decoded userId if available, otherwise fallback to newtonResponse.userId or ssoRequestDto.userId
      const rawUserId = newtonResponse.userId || ssoRequestDto.userId;
      
      if (!rawUserId) {
        this.logger.error('No userId available for existing user', 'SSO_SERVICE');
        throw new HttpException(
          'Unable to determine user ID for existing user',
          HttpStatus.BAD_REQUEST
        );
      }

      // Sanitize userId to remove any invalid characters
      const userId = this.sanitizeUUID(rawUserId);
      
      if (!userId) {
        this.logger.error(
          `Invalid userId format for existing user: ${rawUserId}`,
          'SSO_SERVICE'
        );
        throw new HttpException(
          `Invalid user ID format: ${rawUserId}`,
          HttpStatus.BAD_REQUEST
        );
      }

      // Log if sanitization changed the value
      if (rawUserId !== userId) {
        this.logger.warn(
          `UserId sanitized for existing user: "${rawUserId}" -> "${userId}"`,
          'SSO_SERVICE'
        );
      }

      this.logger.log(
        `Processing existing user: ${userId}`,
        'SSO_SERVICE'
      );

      // Ensure tenantId uses default if not provided
      const effectiveTenantId = ssoRequestDto.tenantId || SSO_DEFAULTS.DEFAULT_TENANT_ID;

      // Update/create newtonData fields every time
      await this.updateNewtonDataFields(
        userId,
        newtonResponse.newtonData,
        userId, // Use the userId as updatedBy
        effectiveTenantId
      );

      // Publish user updated event to Kafka
      this.postgresUserService.publishUserEvent('updated', userId, 'api.sso.service')
        .catch(error => {
          // Log error but don't block - Kafka failures shouldn't affect SSO flow
          this.logger.error(
            `Failed to publish user updated event to Kafka for ${userId}`,
            `Error: ${error.message}`,
            'SSO_SERVICE'
          );
        });

      this.logger.log(
        `Successfully processed existing user: ${userId}`,
        'SSO_SERVICE'
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle existing user: ${error.message}`,
        error.stack,
        'SSO_SERVICE'
      );
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to process existing user',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Generate UUID for response message ID
   * @returns UUID string
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
} 