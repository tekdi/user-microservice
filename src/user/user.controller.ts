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
  BadRequestException,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';

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
} from '@nestjs/swagger';

import { UserSearchDto } from './dto/user-search.dto';
import { UserAdapter } from './useradapter';
import { UserCreateDto } from './dto/user-create.dto';
import { UserUpdateDTO } from './dto/user-update.dto';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { Request, Response } from 'express';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from 'src/common/utils/api-id.config';
import {
  ForgotPasswordDto,
  ResetUserPasswordDto,
  SendPasswordResetLinkDto,
  SendPasswordResetOTPDto,
} from './dto/passwordReset.dto';
import { API_RESPONSES } from '@utils/response.messages';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { OtpSendDTO } from './dto/otpSend.dto';
import { OtpVerifyDTO } from './dto/otpVerify.dto';
import { UserCreateSsoDto } from './dto/user-create-sso.dto';
import { RecaptchaService } from './recaptcha.service';
import jwt_decode from 'jwt-decode';

export interface UserData {
  context: string;
  tenantId: string;
  userId: string;
  fieldValue: boolean;
}

@ApiTags('User')
@Controller()
export class UserController {
  constructor(
    private userAdapter: UserAdapter,
    private readonly recaptchaService: RecaptchaService
  ) {}

  @UseFilters(new AllExceptionsFilter(APIID.USER_GET))
  @Get('read/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiOkResponse({ description: API_RESPONSES.USER_GET_SUCCESSFULLY })
  @ApiNotFoundResponse({ description: API_RESPONSES.USER_NOT_FOUND })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  @ApiBadRequestResponse({ description: API_RESPONSES.BAD_REQUEST })
  @SerializeOptions({ strategy: 'excludeAll' })
  @ApiHeader({ name: 'tenantid' })
  @ApiQuery({
    name: 'fieldvalue',
    description: 'Send True to Fetch Custom Field of User',
    required: false,
  })
  public async getUser(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('fieldvalue') fieldvalue: string | null = null
  ) {
    // Extract request information for logging
    let requesterUsername = 'Unknown';
    
    try {
      // Extract requester info from JWT token if available
      if (request.headers.authorization) {
        const decoded: any = jwt_decode(request.headers.authorization);
        requesterUsername = decoded.preferred_username || 'Unknown';
      }
    } catch (e) {
      // If token decode fails, log the error and continue with Unknown values (IP excluded for legal compliance)
      LoggerUtil.warn(
        `Failed to decode JWT token for getUser request - Error: ${e?.message || 'Unknown error'}`,
        'UserController'
      );
    }

    const tenantId = headers['tenantid'];
    
    // Log API call attempt (username, userId, and IP excluded for legal compliance)
    LoggerUtil.log(
      `GetUser attempt - TenantId: ${tenantId || 'Not provided'}, FieldValue: ${fieldvalue || 'false'}`,
      'UserController',
      undefined, // Username excluded for legal compliance
      'info'
    );

    if (!tenantId) {
      // Log missing tenantId error (username, userId, and IP excluded for legal compliance)
      LoggerUtil.error(
        `GetUser failed - StatusCode: 400, Reason: MISSING_TENANT_ID, Message: Missing tenantId in request headers, IssueType: CLIENT_ERROR`,
        'Missing tenantId in request headers',
        'UserController',
        undefined // Username excluded for legal compliance
      );
      return response
        .status(400)
        .json({ statusCode: 400, error: 'Please provide a tenantId.' });
    }

    const fieldValueBoolean = fieldvalue === 'true';
    // Context and ContextType can be taken from .env later
    const userData: UserData = {
      context: 'USERS',
      tenantId: tenantId,
      userId: userId,
      fieldValue: fieldValueBoolean,
    };

    try {
      const result = await this.userAdapter
        .buildUserAdapter()
        .getUsersDetailsById(userData, response);

      const statusCode = result.statusCode || 200;
      
      // Determine if successful or failed based on status code
      if (statusCode >= 200 && statusCode < 300) {
        // Log successful response (username, userId, and IP excluded for legal compliance)
        LoggerUtil.log(
          `GetUser successful - StatusCode: ${statusCode}, TenantId: ${tenantId}`,
          'UserController',
          undefined, // Username excluded for legal compliance
          'info'
        );
      } else {
        // Log failed response with reason
        let failureReason = 'UNKNOWN_ERROR';
        let issueType = 'SERVER_ERROR';
        
        if (statusCode === 400) {
          failureReason = 'BAD_REQUEST';
          issueType = 'CLIENT_ERROR';
        } else if (statusCode === 404) {
          failureReason = 'USER_NOT_FOUND';
          issueType = 'CLIENT_ERROR';
        } else if (statusCode === 401 || statusCode === 403) {
          failureReason = 'UNAUTHORIZED';
          issueType = 'CLIENT_ERROR';
        } else if (statusCode >= 500) {
          failureReason = 'INTERNAL_SERVER_ERROR';
          issueType = 'SERVER_ERROR';
        }

        // Log failed response (username, userId, and IP excluded for legal compliance)
        LoggerUtil.error(
          `GetUser failed - StatusCode: ${statusCode}, Reason: ${failureReason}, Message: ${result.message || result.error || 'Unknown error'}, IssueType: ${issueType}, TenantId: ${tenantId}`,
          result.error || result.message || 'Unknown error',
          'UserController',
          undefined
        );
      }

      return response.status(statusCode).json(result);
    } catch (error) {
      const errorMessage = error?.message || 'Something went wrong';
      const errorStack = error?.stack || 'No stack trace available';
      const httpStatus = error?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const issueType = httpStatus >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR';
      
      // Log exception with comprehensive details (username, userId, and IP excluded for legal compliance)
      LoggerUtil.error(
        `GetUser exception - StatusCode: ${httpStatus}, Reason: EXCEPTION, Message: ${errorMessage}, IssueType: ${issueType}, TenantId: ${tenantId}`,
        errorStack,
        'UserController',
        undefined // Username excluded for legal compliance
      );

      return response.status(httpStatus).json({
        statusCode: httpStatus,
        error: errorMessage,
        message: 'An error occurred while fetching user details',
      });
    }
  }

  /**
   * Extract client IP address from request
   * Handles proxy headers (X-Forwarded-For, X-Real-IP)
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    
    // Fallback to request IP or socket remote address
    return request.ip || request.socket?.remoteAddress || 'Unknown';
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_CREATE))
  @Post('/create')
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
    name: 'academicyearid',
  })
  async createUser(
    @Headers() headers,
    @Req() request: Request,
    @Body() userCreateDto: UserCreateDto,
    @Res() response: Response
  ) {
    const academicYearId = headers['academicyearid'];
    // Only validate reCAPTCHA if any tenantCohortRoleMapping has the student role
    const isStudent =
      Array.isArray(userCreateDto.tenantCohortRoleMapping) &&
      userCreateDto.tenantCohortRoleMapping.some(
        (mapping) => mapping.roleId === '493c04e2-a9db-47f2-b304-503da358d5f4'
      );
    // If the user is a student, validate the reCAPTCHA token
    if (isStudent) {
      // Check if the reCAPTCHA token is provided
      if (!userCreateDto.recaptchaToken) {
        throw new BadRequestException(
          'reCAPTCHA token is required for student registration'
        );
      }
      try {
        // Validate the reCAPTCHA token
        await this.recaptchaService.validateToken(userCreateDto.recaptchaToken);
      } catch (error) {
        // Optional: Log the original error here for debugging (e.g., using a Logger service)

        // Re-throw if it's already an HTTP exception (preserve original message and status)
        if (error instanceof UnauthorizedException) {
          throw new BadRequestException(error.message); // You can also rethrow it as-is
        }

        throw new BadRequestException('reCAPTCHA validation failed');
      }
    }
    // Proceed with user creation
    return await this.userAdapter
      .buildUserAdapter()
      .createUser(request, userCreateDto, academicYearId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_UPDATE))
  @Patch('update/:userid')
  @UsePipes(new ValidationPipe())
  // @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiBody({ type: UserUpdateDTO })
  @ApiOkResponse({ description: API_RESPONSES.USER_UPDATED_SUCCESSFULLY })
  @ApiHeader({
    name: 'tenantid',
  })
  public async updateUser(
    @Headers() headers,
    @Param('userid') userId: string,
    @Body() userUpdateDto: UserUpdateDTO,
    @Res() response: Response
  ) {
    // userDto.tenantId = headers["tenantid"];
    userUpdateDto.userId = userId;
    return await this.userAdapter
      .buildUserAdapter()
      .updateUser(userUpdateDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_LIST))
  @Post('/list')
  // @UseGuards(JwtAuthGuard)
  // @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: 'User list.' })
  @ApiBody({ type: UserSearchDto })
  @UsePipes(ValidationPipe)
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  public async searchUser(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() userSearchDto: UserSearchDto
  ) {
    const tenantId = headers['tenantid'];
    return await this.userAdapter
      .buildUserAdapter()
      .searchUser(tenantId, request, response, userSearchDto);
  }

  @Post('/password-reset-link')
  @ApiOkResponse({ description: 'Password reset link sent successfully.' })
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

  @Post('/forgot-password')
  @ApiOkResponse({ description: 'Forgot password reset successfully.' })
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
  @Post('/reset-password')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiOkResponse({ description: 'Password reset successfully.' })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @ApiBody({ type: Object })
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
  @Post('/check')
  async checkUser(@Body() body, @Res() response: Response) {
    const result = await this.userAdapter
      .buildUserAdapter()
      .checkUser(body, response);
    return response.status(result.statusCode).json(result);
  }

  //delete
  @UseFilters(new AllExceptionsFilter(APIID.USER_DELETE))
  @Delete('delete/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiOkResponse({ description: 'User deleted successfully' })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  public async deleteUserById(
    @Headers() headers,
    @Param('userId') userId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    return await this.userAdapter
      .buildUserAdapter()
      .deleteUserById(userId, response);
  }
  @UseFilters(new AllExceptionsFilter(APIID.SEND_OTP))
  @Post('send-otp')
  @ApiBody({ type: OtpSendDTO })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOkResponse({ description: API_RESPONSES.OTP_SEND_SUCCESSFULLY })
  async sendOtp(@Body() body: OtpSendDTO, @Res() response: Response) {
    return await this.userAdapter.buildUserAdapter().sendOtp(body, response);
  }
  @UseFilters(new AllExceptionsFilter(APIID.VERIFY_OTP))
  @Post('verify-otp')
  @ApiBody({ type: OtpVerifyDTO })
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiOkResponse({ description: API_RESPONSES.OTP_VALID })
  async verifyOtp(@Body() body: OtpVerifyDTO, @Res() response: Response) {
    return this.userAdapter.buildUserAdapter().verifyOtp(body, response);
  }
  @Post('password-reset-otp')
  @ApiOkResponse({ description: 'Password reset link sent successfully.' })
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

  @UseFilters(new AllExceptionsFilter(APIID.USER_CREATE))
  @Post('/sso-synch')
  @UsePipes(new ValidationPipe())
  @ApiCreatedResponse({ description: API_RESPONSES.USER_CREATE_SUCCESSFULLY })
  @ApiBody({ type: UserCreateSsoDto })
  @ApiForbiddenResponse({ description: API_RESPONSES.USER_EXISTS })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  @ApiConflictResponse({ description: API_RESPONSES.DUPLICATE_DATA })
  @ApiHeader({
    name: 'academicyearid',
  })
  async createSsoUser(
    @Headers() headers,
    @Req() request: Request,
    @Body() userCreateSsoDto: UserCreateSsoDto,
    @Res() response: Response
  ) {
    const academicYearId = headers['academicyearid'];
    return await this.userAdapter
      .buildUserAdapter()
      .createSsoUser(request, userCreateSsoDto, academicYearId, response);
  }

  @Get('/sso-callback')
  @UsePipes(new ValidationPipe())
  @ApiQuery({ name: 'code', required: true })
  @ApiCreatedResponse({ description: API_RESPONSES.USER_CREATE_SUCCESSFULLY })
  @ApiForbiddenResponse({ description: API_RESPONSES.USER_EXISTS })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  @ApiConflictResponse({ description: API_RESPONSES.DUPLICATE_DATA })
  async ssoCallback(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const code = request.query.code ?? request.body?.code;
    if (!code) {
      return response
        .status(400)
        .json({ message: 'Missing authorization code' });
    }

    try {
      const result = await this.userAdapter
        .buildUserAdapter()
        .ssoCallback(code, request, response);

      return response.status(201).json(result);
    } catch (error) {
      return response.status(500).json({ message: error.message });
    }
  }
}
