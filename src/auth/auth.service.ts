import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserAdapter } from 'src/user/useradapter';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import APIResponse from 'src/common/responses/response';
import { KeycloakService } from 'src/common/utils/keycloak.service';
import { APIID } from 'src/common/utils/api-id.config';
import { Response, Request } from 'express';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { AuthDto } from './dto/auth-dto';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
};
@Injectable()
export class AuthService {
  constructor(
    private readonly useradapter: UserAdapter,
    private readonly keycloakService: KeycloakService
  ) {}

  async login(authDto: AuthDto, request: Request, response: Response) {
    const apiId = APIID.LOGIN;
    const { username, password } = authDto;

    // Extract request information for logging
    const userAgent = request.headers['user-agent'] || 'Unknown';

    // Log login attempt start (username and IP excluded for legal compliance)
    LoggerUtil.log(
      `Login attempt initiated - User-Agent: ${userAgent}`,
        'AuthService',
        undefined,
      'info'
    );

    try {
      // Optimized: Only check user status (no tenant/role data needed for login)
      const userData = await this.useradapter
        .buildUserAdapter()
        .findUserStatusForLogin(username);

      // Handle case: user not found or user is inactive
      if (!userData || userData.status === 'inactive') {
        const errorMessage = !userData
          ? 'User details not found for user'
          : 'User is inactive, please verify your email';

        const failureReason = userData ? 'USER_INACTIVE' : 'USER_NOT_FOUND';

        // Log failed login attempt with reason and status code (username and IP excluded for legal compliance)
        LoggerUtil.error(
          `Login failed - StatusCode: ${HttpStatus.BAD_REQUEST}, Reason: ${failureReason}, Message: ${errorMessage}, IssueType: CLIENT_ERROR`,
          errorMessage,
          'AuthService'
        );

        return APIResponse.error(
          response,
          apiId,
          'Bad Request',
          errorMessage,
          HttpStatus.BAD_REQUEST
        );
      }

      // If user is found, proceed to login with retry logic
      const {
        access_token,
        expires_in,
        refresh_token,
        refresh_expires_in,
        token_type,
      } = await this.keycloakService.login(username, password);

      const res = {
        access_token,
        refresh_token,
        expires_in,
        refresh_expires_in,
        token_type,
      };

      // Log successful login with status code (username and IP excluded for legal compliance)
      LoggerUtil.log(
        `Login successful - User-Agent: ${userAgent}, StatusCode: ${HttpStatus.OK}`,
        'AuthService',
        undefined,
        'info'
      );

      return APIResponse.success(
        response,
        apiId,
        res,
        HttpStatus.OK,
        'Auth Token fetched Successfully.'
      );
    } catch (error) {
      if (error.response && error.response.status === 401) {
        // Log invalid credentials with status code (username and IP excluded for legal compliance)
        LoggerUtil.error(
          `Login failed - StatusCode: ${HttpStatus.UNAUTHORIZED}, Reason: INVALID_CREDENTIALS, Message: Invalid username or password, IssueType: CLIENT_ERROR`,
          'Invalid username or password',
          'AuthService'
        );
        throw new NotFoundException('Invalid username or password');
      } else {
        const errorMessage = error?.message || 'Something went wrong';
        const errorStack = error?.stack || 'No stack trace available';
        const httpStatus =
          error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const issueType = httpStatus >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR';

        // Determine failure reason based on httpStatus
        let failureReason = 'INTERNAL_SERVER_ERROR';
        if (httpStatus >= 400 && httpStatus < 500) {
          if (httpStatus === 400) {
            failureReason = 'BAD_REQUEST';
          } else if (httpStatus === 403) {
            failureReason = 'FORBIDDEN';
          } else if (httpStatus === 404) {
            failureReason = 'NOT_FOUND';
          } else if (httpStatus === 429) {
            failureReason = 'RATE_LIMIT_EXCEEDED';
          } else {
            failureReason = 'CLIENT_ERROR';
          }
        } else if (httpStatus >= 500) {
          if (httpStatus === 502) {
            failureReason = 'BAD_GATEWAY';
          } else if (httpStatus === 503) {
            failureReason = 'SERVICE_UNAVAILABLE';
          } else if (httpStatus === 504) {
            failureReason = 'GATEWAY_TIMEOUT';
          }
          // failureReason already defaults to 'INTERNAL_SERVER_ERROR' for other 5xx errors
        }

        // Log error with status code and issue type (username and IP excluded for legal compliance)
        LoggerUtil.error(
          `Login failed - StatusCode: ${httpStatus}, Reason: ${failureReason}, Message: ${errorMessage}, IssueType: ${issueType}`,
          errorStack,
          'AuthService'
        );

        return APIResponse.error(
          response,
          apiId,
          'Internal Server Error',
          `Error : ${errorMessage}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }

  public async getUserByAuth(request: any, tenantId, response: Response) {
    const apiId = APIID.USER_AUTH;

    // Extract request information for logging
    const userAgent = request.headers['user-agent'] || 'Unknown';

    try {
      // Log API call attempt (username and IP excluded for legal compliance)
      LoggerUtil.log(
        `GetUserByAuth attempt - User-Agent: ${userAgent}, TenantId: ${
          tenantId || 'Not provided'
        }`,
        'AuthService',
        undefined,
        'info'
      );

      // Decode JWT token to get username
      const decoded: any = jwt_decode(request.headers.authorization);
      const username = decoded.preferred_username || 'Unknown';

      // Log with username after decoding (username, userId, and IP excluded for legal compliance)
      LoggerUtil.log(
        `GetUserByAuth processing - TenantId: ${tenantId || 'Not provided'}`,
        'AuthService',
        undefined,
        'info'
      );

      const data = await this.useradapter
        .buildUserAdapter()
        .findUserDetails(null, username, tenantId);

      // Log successful response (username, userId, and IP excluded for legal compliance)
      LoggerUtil.log(
        `GetUserByAuth successful - StatusCode: ${HttpStatus.OK}`,
        'AuthService',
        undefined,
        'info'
      );

      return APIResponse.success(
        response,
        apiId,
        data,
        HttpStatus.OK,
        'User fetched by auth token Successfully.'
      );
    } catch (e) {
      const errorMessage = e?.message || 'Something went wrong';
      const errorStack = e?.stack || 'No stack trace available';

      // Determine error type for logging purposes (but keep API response consistent)
      let detectedStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      let failureReason = 'INTERNAL_SERVER_ERROR';
      let issueType = 'SERVER_ERROR';

      if (
        e.name === 'JsonWebTokenError' ||
        e.message?.includes('token') ||
        e.message?.includes('jwt')
      ) {
        detectedStatus = HttpStatus.UNAUTHORIZED;
        failureReason = 'INVALID_TOKEN';
        issueType = 'CLIENT_ERROR';
      } else if (
        e.message?.includes('not found') ||
        e.message?.includes('does not exist')
      ) {
        detectedStatus = HttpStatus.NOT_FOUND;
        failureReason = 'USER_NOT_FOUND';
        issueType = 'CLIENT_ERROR';
      } else if (
        e.message?.includes('unauthorized') ||
        e.message?.includes('forbidden')
      ) {
        detectedStatus = HttpStatus.FORBIDDEN;
        failureReason = 'UNAUTHORIZED';
        issueType = 'CLIENT_ERROR';
      }

      // Log failed attempt with comprehensive details (username, userId, and IP excluded for legal compliance)
      LoggerUtil.error(
        `GetUserByAuth failed - DetectedStatusCode: ${detectedStatus}, Reason: ${failureReason}, Message: ${errorMessage}, IssueType: ${issueType}, TenantId: ${
          tenantId || 'Not provided'
        }`,
        errorStack,
        'AuthService'
      );

      // Keep original API response behavior - always return INTERNAL_SERVER_ERROR
      return APIResponse.error(
        response,
        apiId,
        'Internal Server Error',
        `Error : ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async refreshToken(
    refreshToken: string,
    response: Response
  ): Promise<LoginResponse> {
    const apiId = APIID.REFRESH;
    const { access_token, expires_in, refresh_token, refresh_expires_in } =
      await this.keycloakService.refreshToken(refreshToken).catch(() => {
        throw new UnauthorizedException();
      });

    const res = {
      access_token,
      refresh_token,
      expires_in,
      refresh_expires_in,
    };
    return APIResponse.success(
      response,
      apiId,
      res,
      HttpStatus.OK,
      'Refresh Token fetched Successfully.'
    );
  }

  async logout(refreshToken: string, response: Response) {
    const apiId = APIID.LOGOUT;
    try {
      const logout = await this.keycloakService.logout(refreshToken);
      return APIResponse.success(
        response,
        apiId,
        logout,
        HttpStatus.OK,
        'Logged Out Successfully.'
      );
    } catch (error) {
      if (error.response && error.response.status === 400) {
        throw new UnauthorizedException();
      } else {
        const errorMessage = error?.message || 'Something went wrong';
        return APIResponse.error(
          response,
          apiId,
          'Internal Server Error',
          `Error : ${errorMessage}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }
}
