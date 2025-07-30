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

import {
  ExistUserDto,
  SuggestUserDto,
  UserSearchDto,
} from "./dto/user-search.dto";
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
import { CacheService } from "src/cache/cache.service";
import { createHash } from "crypto";
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
    private readonly uploadS3Service: UploadS3Service,
    private readonly cacheService: CacheService,
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
    @Query("fieldvalue") fieldvalue: string | null = null,
  ) {
    const tenantId = headers["tenantid"];
    if (!tenantId) {
      LoggerUtil.warn(
        `${API_RESPONSES.BAD_REQUEST}`,
        `Error: Missing tenantId in request headers for user ${userId}`,
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

    // -------------------- CACHE START --------------------
    const cacheKey = `user:profile:${userId}:${tenantId}:${fieldValueBoolean}`;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      // assumption: cached object already contains statusCode & payload
      return response.status(cached.statusCode || 200).json(cached);
    }
    // -------------------- CACHE END --------------------
    const result = await this.userAdapter
      .buildUserAdapter()
      .getUsersDetailsById(userData, response);

    // Cache only on successful fetch (2xx)
    if (result && result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
      // 15 minutes TTL (900 seconds)
      await this.cacheService.set(cacheKey, result, 15 * 60);
    }

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
    @Res() response: Response,
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
    @Res() response: Response,
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
    @Body() userSearchDto: UserSearchDto,
  ) {
    const tenantId = headers["tenantid"];

    // Generate a hash of the search DTO for cache key uniqueness
    const hash = createHash("md5")
      .update(JSON.stringify(userSearchDto))
      .digest("hex");
    const cacheKey = `users:search:${hash}:${tenantId}`;

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return response.status(cached.statusCode || 200).json(cached);
    }

    const result = await this.userAdapter
      .buildUserAdapter()
      .searchUser(tenantId, request, response, userSearchDto);

    if (result && result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
      // 10 minutes TTL
      await this.cacheService.set(cacheKey, result, 10 * 60);
    }

    return response.status(result.statusCode).json(result);
  }

  @Post("/password-reset-link")
  @ApiOkResponse({ description: "Password reset link sent successfully." })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiBody({ type: SendPasswordResetLinkDto })
  public async sendPasswordResetLink(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: SendPasswordResetLinkDto,
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .sendPasswordResetLink(
        request,
        reqBody.username,
        reqBody.redirectUrl,
        response,
      );
  }

  @Post("/forgot-password")
  @ApiOkResponse({ description: "Forgot password reset successfully." })
  @ApiBody({ type: ForgotPasswordDto })
  @UsePipes(new ValidationPipe({ transform: true }))
  public async forgotPassword(
    @Req() request: Request,
    @Res() response: Response,
    @Body() reqBody: ForgotPasswordDto,
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
    @Body() reqBody: ResetUserPasswordDto,
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .resetUserPassword(
        request,
        reqBody.userName,
        reqBody.newPassword,
        response,
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
    @Res() response: Response,
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
    @Res() response: Response,
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
    @Res() response: Response,
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
    @Body() reqBody: SendPasswordResetOTPDto,
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
    @Res() response,
  ) {
    const cacheKey = `presigned:${filename}:${foldername}:${fileType}`;
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached) {
      return { url: cached };
    }

    const url = await this.uploadS3Service.getPresignedUrl(
      filename,
      fileType,
      response,
      foldername,
    );

    // Cache for 10 minutes
    await this.cacheService.set(cacheKey, url, 10 * 60);

    return { url };
  }
}
