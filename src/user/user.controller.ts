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
    userUpdateDto.userId = userId;
    const tenantId = headers["tenantid"];
    userUpdateDto.userData.tenantId = tenantId ? tenantId : null;

    return await this.userAdapter
      .buildUserAdapter()
      .updateUser(userUpdateDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_LIST))
  @Post("/list")
  // @UseGuards(JwtAuthGuard)
  // @ApiBasicAuth("access-token")
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
    return await this.userAdapter
      .buildUserAdapter()
      .searchUser(tenantId, request, response, userSearchDto);
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
    schema: {
      type: "object",
      properties: {
        statusCode: { type: "number", example: 200 },
        message: { type: "string", example: "Users retrieved successfully using village filter" },
        data: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  userId: { type: "string" },
                  username: { type: "string" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  email: { type: "string" },
                  mobile: { type: "string" },
                  roles: { type: "array", items: { type: "string" } },
                  customfield: {
                    type: "object",
                    description: "Custom fields data (only included if customfields requested). Location fields (state, district, block, village, center, batch) show names, other fields show original values.",
                    example: {
                      "state": "Maharashtra",
                      "district": "Pune", 
                      "center": "Learning Center A",
                      "batch": "Morning Batch 2024",
                      "designation": "Lead Teacher"
                    }
                  }
                }
              }
            },
            totalCount: { type: "number", example: 150 },
            currentPageCount: { type: "number", example: 10 },
            limit: { type: "number", example: 10 },
            offset: { type: "number", example: 0 },
            filters: {
              type: "object",
              properties: {
                locationFilter: {
                  type: "object",
                  properties: {
                    level: { type: "string", example: "state" },
                    values: { type: "array", items: { type: "string" }, example: ["27"] }
                  }
                },
                roleFilter: {
                  type: "object", 
                  properties: {
                    roles: { type: "array", items: { type: "string" }, example: ["Instructor", "Lead"] }
                  }
                }
              }
            },
            sort: {
              type: "object",
              properties: {
                field: { type: "string", example: "name" },
                direction: { type: "string", example: "asc" }
              }
            }
          }
        }
      }
    }
  })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiBody({ 
    type: HierarchicalLocationFiltersDto,
    examples: {
      stateOnly: {
        summary: "State-level search only",
        description: "Search users by state IDs only",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "state": ["27", "28"]
          },
          "sort": ["name", "asc"]
        }
      },
      stateWithCustomFields: {
        summary: "State-level search with custom fields",
        description: "Search users by state IDs with custom field data",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "state": ["27"]
          },
          "customfields": ["state", "district", "block", "village", "center", "main_subject", "subject"],
          "sort": ["name", "asc"]
        }
      },
      villageOnly: {
        summary: "Village-level search only",
        description: "Search users by village IDs only (takes priority over state/district)",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "village": ["village-uuid-1"]
          },
          "sort": ["firstName", "asc"]
        }
      },
      batchOnly: {
        summary: "Batch-level search only",
        description: "Direct search by batch/cohort IDs only",
        value: {
          "limit": 15,
          "offset": 0,
          "filters": {
            "batch": ["batch-uuid-1", "batch-uuid-2"]
          },
          "sort": ["lastName", "desc"]
        }
      },
      multipleFilters: {
        summary: "Multiple filters (deepest wins)",
        description: "When multiple filters provided, only the deepest (village) is used",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "state": ["27"],
            "district": ["dist-1"],
            "village": ["village-1"]
          },
          "sort": ["email", "asc"]
        }
      },
      roleOnly: {
        summary: "Role-based search only",
        description: "Search users by role names only",
        value: {
          "limit": 10,
          "offset": 0,
          "role": ["Instructor", "Lead"],
          "sort": ["name", "asc"]
        }
      },
      locationAndRole: {
        summary: "Location and role filters combined with custom fields",
        description: "Search users by both location (state) and role filters - returns intersection. Custom fields for location (state, district, block, village, center, batch) will show names instead of IDs.",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "state": ["27"]
          },
          "role": ["Instructor", "Lead", "Content creator"],
          "customfields": ["state", "district", "center", "batch", "designation"],
          "sort": ["name", "asc"]
        }
      },
      centerAndBatch: {
        summary: "Request with center and batch custom fields",
        description: "Example showing center (resolved from Cohort table by cohortId) and batch (resolved from Cohort table by parentId) fields",
        value: {
          "limit": 10,
          "offset": 0,
          "filters": {
            "state": ["27"]
          },
          "customfields": ["center", "batch"],
          "sort": ["name", "asc"]
        }
      }
    }
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
    
    // Validate mandatory tenantId
    if (!tenantId) {
      return response.status(400).json({
        statusCode: 400,
        message: "tenantid header is required",
        error: "Bad Request"
      });
    }
    
    return await this.userAdapter
      .buildUserAdapter()
      .getUsersByHierarchicalLocation(tenantId, request, response, hierarchicalFiltersDto);
  }
}
