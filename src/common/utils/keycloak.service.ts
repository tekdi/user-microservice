import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import qs from "qs";

type LoginResponse = {
  access_token: string;
  scope: string;
  refresh_token: string;
  token_type: string;
  session_state: string;
  refresh_expires_in: number;
  expires_in: number;
};

type UserInfoResponse = {
  sub: string;
  email_verified: boolean;
  preferred_username: string;
};

@Injectable()
export class KeycloakService {
  private baseURL: string;
  private realm: string;
  private clientId: string;
  private clientSecret: string;
  private axios;
  userToken: any;
  constructor(private readonly configService: ConfigService) {
    this.baseURL = this.configService.get("KEYCLOAK");
    this.userToken = this.configService.get("KEYCLOAK_USER_TOKEN");
    this.realm = this.configService.get("KEYCLOAK_REALM");
    this.clientId = this.configService.get("KEYCLOAK_CLIENT_ID");
    this.clientSecret = this.configService.get("KEYCLOAK_CLIENT_SECRET");
    this.axios = axios.create();
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const data = qs.stringify({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "password",
      username,
      password,
    });

    const axiosConfig = {
      method: "post",
      url: `${this.baseURL}realms/${this.realm}/protocol/openid-connect/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
      timeout: 15000, // 15 second timeout to prevent hanging
    };

    // Retry logic for transient Keycloak errors
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.axios(axiosConfig);
        return res.data;
      } catch (error) {
        lastError = error;
        const statusCode = error?.response?.status;
        const isRetryable = 
          statusCode === 503 || // Service Unavailable
          statusCode === 504 || // Gateway Timeout
          statusCode === 429 || // Too Many Requests
          statusCode === 500 || // Internal Server Error
          error.code === 'ECONNRESET' || // Connection reset
          error.code === 'ETIMEDOUT' || // Timeout
          error.code === 'ECONNREFUSED'; // Connection refused

        // Don't retry on 401 (invalid credentials) or 400 (bad request)
        if (statusCode === 401 || statusCode === 400) {
          throw error; // Re-throw authentication errors immediately
        }

        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or max retries reached
          throw error;
        }

        // Retry with exponential backoff
        const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    throw lastError;
  }

  async getUserInfo(accessToken: string): Promise<UserInfoResponse> {
    // const { data } = await firstValueFrom(
    //   this.httpService.get(
    //     `${this.baseURL}/auth/realms/${this.realm}/protocol/openid-connect/userinfo`,
    //     {
    //       headers: {
    //         Authorization: `Bearer ${accessToken}`,
    //       },
    //     }
    //   )
    // );

    // const data = qs.stringify({
    //   client_id: this.clientId,
    //   client_secret: this.clientSecret,
    //   grant_type: "refresh_token",
    //   refresh_token: refreshToken,
    // });

    const axiosConfig = {
      method: "post",
      url: `${this.baseURL}realms/${this.realm}/protocol/openid-connect/userinfo`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
    };

    const res = await this.axios(axiosConfig);

    return res.data;
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const data = qs.stringify({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const axiosConfig = {
      method: "post",
      url: `${this.baseURL}realms/${this.realm}/protocol/openid-connect/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
      timeout: 15000, // 15 second timeout
    };

    const res = await this.axios(axiosConfig);

    return res.data;
  }

  async logout(refreshToken: string) {
    const data = qs.stringify({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    const axiosConfig = {
      method: "post",
      url: `${this.baseURL}realms/${this.realm}/protocol/openid-connect/logout`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
      timeout: 10000, // 10 second timeout
    };

    const res = await this.axios(axiosConfig);

    return res.data;
  }
}
