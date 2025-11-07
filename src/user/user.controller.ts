import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  SerializeOptions,
  Req,
  Headers,
  Res,
  Patch,
  UseGuards,
  Query,
  UsePipes,
  ValidationPipe,
  Delete,
  ParseUUIDPipe,
  UseFilters,
} from "@nestjs/common";

import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiQuery,
  ApiHeader,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
} from "@nestjs/swagger";

import { ExistUserDto, SuggestUserDto, UserSearchDto } from "./dto/user-search.dto";
import { HierarchicalLocationFiltersDto } from "./dto/user-hierarchical-search.dto";
import { UserHierarchyViewDto } from "./dto/user-hierarchy-view.dto";
import { UserAdapter } from "./useradapter";
import { UserCreateDto } from "./dto/user-create.dto";
import { UserUpdateDTO } from "./dto/user-update.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { Request, Response } from "express";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
import {
  ForgotPasswordDto,
  ResetUserPasswordDto,
  SendPasswordResetLinkDto,
  SendPasswordResetOTPDto,
} from "./dto/passwordReset.dto";
import { isUUID } from "class-validator";
import { API_RESPONSES } from "@utils/response.messages";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { OtpSendDTO } from "./dto/otpSend.dto";
import { OtpVerifyDTO } from "./dto/otpVerify.dto";
import { UploadS3Service } from "src/common/services/upload-S3.service";
import { GetUserId } from "src/common/decorators/getUserId.decorator";
import { GetTenantId } from "src/common/decorators/getTenantId.decorator";
export interface UserData {
  context: string;
  tenantId: string;
  userId: string;
  fieldValue: boolean;
}

@ApiTags("User")
@Controller()
export class UserController {
  constructor(
    private userAdapter: UserAdapter,
    private readonly uploadS3Service: UploadS3Service
  ) {}

  @UseFilters(new AllExceptionsFilter(APIID.USER_GET))
  @Get("read/:userId")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: API_RESPONSES.USER_GET_SUCCESSFULLY })
  @ApiNotFoundResponse({ description: API_RESPONSES.USER_NOT_FOUND })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  @ApiBadRequestResponse({ description: API_RESPONSES.BAD_REQUEST })
  @SerializeOptions({ strategy: "excludeAll" })
  @ApiHeader({ name: "tenantid" })
  @ApiQuery({
    name: "fieldvalue",
    description: "Send True to Fetch Custom Field of User",
    required: false,
  })
  public async getUser(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query("fieldvalue") fieldvalue: string | null = null
  ) {
    const tenantId = headers["tenantid"];
    if (!tenantId) {
      LoggerUtil.warn(
        `${API_RESPONSES.BAD_REQUEST}`,
        `Error: Missing tenantId in request headers for user ${userId}`
      );
      return response
        .status(400)
        .json({ statusCode: 400, error: "Please provide a tenantId." });
    }
    const fieldValueBoolean = fieldvalue === "true";
    // Context and ContextType can be taken from .env later
    const userData: UserData = {
      context: "USERS",
      tenantId: tenantId,
      userId: userId,
      fieldValue: fieldValueBoolean,
    };
    const result = await this.userAdapter
      .buildUserAdapter()
      .getUsersDetailsById(userData, response);

    return response.status(result.statusCode).json(result);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_CREATE))
  @Post("/create")
  // @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe())
  // @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: API_RESPONSES.USER_CREATE_SUCCESSFULLY })
  @ApiBody({ type: UserCreateDto })
  @ApiForbiddenResponse({ description: API_RESPONSES.USER_EXISTS })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  @ApiConflictResponse({ description: API_RESPONSES.DUPLICATE_DATA })
  @ApiHeader({
    name: "academicyearid",
  })
  async createUser(
    @Headers() headers,
    @Req() request: Request,
    @Body() userCreateDto: UserCreateDto,
    @Res() response: Response
  ) {
    const academicYearId = headers["academicyearid"];
    // if (!academicYearId || !isUUID(academicYearId)) {
    //   throw new BadRequestException(
    //     "academicYearId is required and academicYearId must be a valid UUID."
    //   );
    // }
    return await this.userAdapter
      .buildUserAdapter()
      .createUser(request, userCreateDto, academicYearId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_UPDATE))
  @Patch("update/:userid")
  @UsePipes(new ValidationPipe())
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiBody({ type: UserUpdateDTO })
  @ApiOkResponse({ description: API_RESPONSES.USER_UPDATED_SUCCESSFULLY })
  @ApiHeader({
    name: "tenantid",
  })
  public async updateUser(
    @Headers() headers,
    @Param("userid") userId: string,
    @GetUserId("loginUserId", ParseUUIDPipe) loginUserId: string,
    @Body() userUpdateDto: UserUpdateDTO,
    @Res() response: Response
  ) {
    userUpdateDto.userData.updatedBy = loginUserId;
    userUpdateDto.userData.createdBy = loginUserId;
    userUpdateDto.userId = userId;
    const tenantId = headers["tenantid"];
    userUpdateDto.userData.tenantId = tenantId ? tenantId : null;

    return await this.userAdapter
      .buildUserAdapter()
      .updateUser(userUpdateDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_LIST))
  @Post("/list")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "User list." })
  @ApiBody({ type: UserSearchDto })
  @UsePipes(ValidationPipe)
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
  })
  public async searchUser(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() userSearchDto: UserSearchDto
  ) {
    const tenantId = headers["tenantid"];
    const shouldIncludeCustomFields = userSearchDto.includeCustomFields !== "false";
    return await this.userAdapter
      .buildUserAdapter()
      .searchUser(tenantId, request, response, userSearchDto, shouldIncludeCustomFields);
  }

  @Post("/password-reset-link")
  @ApiOkResponse({ description: "Password reset link sent successfully." })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: SendPasswordResetLinkDto })
  public async sendPasswordResetLink(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: SendPasswordResetLinkDto
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .sendPasswordResetLink(
        request,
        reqBody.username,
        reqBody.redirectUrl,
        response
      );
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_HIERARCHY_VIEW))
  @Post("/user/v1/users-hierarchy-view")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "User hierarchy view by email." })
  @ApiBody({ type: UserHierarchyViewDto })
  @UsePipes(ValidationPipe)
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
    required: true,
    description: "Tenant ID (must be a valid UUID)",
  })
  public async searchUserMultiTenant(
    @GetTenantId() tenantId: string,
    @Req() request: Request,
    @Res() response: Response,
    @Body() userHierarchyViewDto: UserHierarchyViewDto
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .searchUserMultiTenant(tenantId, request, response, userHierarchyViewDto);
  }
  
  @Post("/forgot-password")
  @ApiOkResponse({ description: "Forgot password reset successfully." })
  @ApiBody({ type: ForgotPasswordDto })
  @UsePipes(new ValidationPipe({ transform: true }))
  public async forgotPassword(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: ForgotPasswordDto
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .forgotPassword(request, reqBody, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_RESET_PASSWORD))
  @Post("/reset-password")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "Password reset successfully." })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiBody({ type: ResetUserPasswordDto })
  public async resetUserPassword(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: ResetUserPasswordDto
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .resetUserPassword(
        request,
        reqBody.userName,
        reqBody.newPassword,
        response
      );
  }

  // required for FTL
  @UseFilters(new AllExceptionsFilter(APIID.USER_CREATE))
  @Post("/check")
  @ApiBody({ type: ExistUserDto })
  @UsePipes(new ValidationPipe())
  async checkUser(
    @Req() request: Request,
    @Body() existUserDto: ExistUserDto,
    @Res() response: Response
  ) {
    const result = await this.userAdapter
      .buildUserAdapter()
      .checkUser(request, response, existUserDto);
    return response.status(result.statusCode).json(result);
  }


  // required for FTL
  @UseFilters(new AllExceptionsFilter(APIID.SUGGEST_USERNAME))
  @Post("/suggestUsername")
  @ApiBody({ type: SuggestUserDto })
  @ApiOkResponse({ description: "Username suggestion generated successfully" })
  @ApiBadRequestResponse({ description: "Invalid input parameters" })
  @UsePipes(new ValidationPipe())
  async suggestUsername(
    @Req() request: Request,
    @Body() suggestUserDto: SuggestUserDto,
    @Res() response: Response
  ) {
    const result = await this.userAdapter
      .buildUserAdapter()
      .suggestUsername(request, response, suggestUserDto);
    return response.status(result.statusCode).json(result);
  }


  //delete
  @UseFilters(new AllExceptionsFilter(APIID.USER_DELETE))
  @Delete("delete/:userId")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "User deleted successfully" })
  @ApiNotFoundResponse({ description: "Data not found" })
  @SerializeOptions({
    strategy: "excludeAll",
  })
  public async deleteUserById(
    @Headers() headers,
    @Param("userId") userId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .deleteUserById(userId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.SEND_OTP))
  @Post("send-otp")
  @ApiBody({ type: OtpSendDTO })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOkResponse({ description: API_RESPONSES.OTP_SEND_SUCCESSFULLY })
  async sendOtp(@Body() body: OtpSendDTO, @Res() response: Response) {
    return await this.userAdapter.buildUserAdapter().sendOtp(body, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.VERIFY_OTP))
  @Post("verify-otp")
  @ApiBody({ type: OtpVerifyDTO })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOkResponse({ description: API_RESPONSES.OTP_VALID })
  async verifyOtp(@Body() body: OtpVerifyDTO, @Res() response: Response) {
    return this.userAdapter.buildUserAdapter().verifyOtp(body, response);
  }

  @Post("password-reset-otp")
  @ApiOkResponse({ description: "Password reset link sent successfully." })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: SendPasswordResetOTPDto })
  public async sendPasswordResetOTP(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: SendPasswordResetOTPDto
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .sendPasswordResetOTP(reqBody, response);
  }
  @Get("presigned-url")
  async getPresignedUrl(
    @Query("filename") filename: string,
    @Query("foldername") foldername: string,
    @Query("fileType") fileType: string,
    @Res() response
  ) {
    const url = await this.uploadS3Service.getPresignedUrl(
      filename,
      fileType,
      response,
      foldername
    );
    return { url };
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_LIST))
  @Post("hierarchical-search")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ 
    description: "User list based on hierarchical location filters with pagination and sorting.",
  })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiBody({ 
    type: HierarchicalLocationFiltersDto
  })
  @UsePipes(new ValidationPipe({ 
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }))
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
    description: "Tenant ID for filtering users within specific tenant (Required)",
    required: true
  })
  public async getUsersByHierarchicalLocation(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() hierarchicalFiltersDto: HierarchicalLocationFiltersDto
  ) {
    const tenantId = headers["tenantid"];
    const apiId = APIID.USER_LIST;
    
    // Comprehensive tenantId validation
    const tenantValidation = this.validateTenantId(tenantId);
    if (!tenantValidation.isValid) {
      LoggerUtil.error(
        `TenantId validation failed: ${tenantValidation.error}`,
        `Received tenantId: ${tenantId}`,
        apiId
      );
      
      return response.status(400).json({
        id: apiId,
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: "",
          status: "failed",
          err: tenantValidation.error,
          errmsg: "Invalid tenant information"
        },
        responseCode: 400,
        result: {}
      });
    }
    
    return await this.userAdapter
      .buildUserAdapter()
      .getUsersByHierarchicalLocation(tenantId, request, response, hierarchicalFiltersDto);
  }

  /**
   * Comprehensive tenant ID validation
   * @param tenantId - Tenant ID from headers
   * @returns Validation result with error details
   */
  private validateTenantId(tenantId: any): { isValid: boolean; error?: string } {
    // Check if tenantId is present
    if (!tenantId) {
      return {
        isValid: false,
        error: "tenantid header is required"
      };
    }

    // Check if tenantId is a non-empty string
    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      return {
        isValid: false,
        error: "tenantid must be a non-empty string"
      };
    }

    // Check if tenantId is a valid UUID format
    if (!isUUID(tenantId)) {
      return {
        isValid: false,
        error: "tenantid must be a valid UUID format"
      };
    }

    return { isValid: true };
  }
}
