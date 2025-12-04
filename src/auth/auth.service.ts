import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { UserService } from "src/user/user.service";
import axios from "axios";
import jwt_decode from "jwt-decode";
import APIResponse from "src/common/responses/response";
import { KeycloakService } from "src/common/utils/keycloak.service";
import { APIID } from "src/common/utils/api-id.config";
import { Response } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "src/user/entities/user-entity";
import { LoggerUtil } from "src/common/logger/LoggerUtil";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
};
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly keycloakService: KeycloakService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) { }

  async login(authDto, response: Response) {
    const apiId = APIID.LOGIN;
    const { username, password } = authDto;
    try {
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

      return APIResponse.success(
        response,
        apiId,
        res,
        HttpStatus.OK,
        "Auth Token fetched Successfully."
      );
    } catch (error) {
      if (error.response && error.response.status === 401) {
        throw new NotFoundException("Invalid username or password");
      } else {
        const errorMessage = error?.message || "Something went wrong";
        return APIResponse.error(
          response,
          apiId,
          "Internal Server Error",
          `Error : ${errorMessage}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }

  public async getUserByAuth(request: any, tenantId, response: Response) {
    const apiId = APIID.USER_AUTH;
    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      const username = decoded.preferred_username;
      const data = await this.userService
        .findUserDetails(null, username, tenantId);

      // Update lastLogin timestamp for the user (stored in UTC/GMT)
      if (data && data.userId) {
        await this.userRepository.update(
          { userId: data.userId },
          { lastLogin: new Date() } // Stored as UTC/GMT in timestamptz column
        );
      }

      // Send response to the client first (low latency)
      const apiResponse = APIResponse.success(
        response,
        apiId,
        data,
        HttpStatus.OK,
        "User fetched by auth token Successfully."
      );

      // Publish user login event to Kafka asynchronously - after response is sent to client
      // Using 'login' event type which only sends lastLogin timestamp (lightweight)
      if (data && data.userId) {
        this.userService
          .publishUserEvent('login', data.userId, apiId)
          .catch(error => {
            // Log error but don't block - Kafka failures shouldn't affect auth flow
            LoggerUtil.error(
              `Failed to publish user login event to Kafka for ${username}`,
              `Error: ${error.message}`,
              apiId
            );
          });
      }
    } catch (e) {
      const errorMessage = e?.message || "Something went wrong";
      return APIResponse.error(
        response,
        apiId,
        "Internal Server Error",
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
      "Refresh Token fetched Successfully."
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
        "Logged Out Successfully."
      );
    } catch (error) {
      if (error.response && error.response.status === 400) {
        throw new UnauthorizedException();
      } else {
        const errorMessage = error?.message || "Something went wrong";
        return APIResponse.error(
          response,
          apiId,
          "Internal Server Error",
          `Error : ${errorMessage}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }
  }
}
