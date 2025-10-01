import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { UserAdapter } from "src/user/useradapter";
import axios from "axios";
import jwt_decode from "jwt-decode";
import APIResponse from "src/common/responses/response";
import { KeycloakService } from "src/common/utils/keycloak.service";
import { APIID } from "src/common/utils/api-id.config";
import { Response } from "express";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { RequestMagicLinkDto } from "./dto/magic-link.dto";
import { MagicLink } from "./entities/magic-link.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationRequest } from "@utils/notification.axios";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from '@nestjs/config';

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
    private readonly keycloakService: KeycloakService,
    @InjectRepository(MagicLink)
    private magicLinkRepository: Repository<MagicLink>,
    private jwtService: JwtService,
    private notificationService: NotificationRequest,
    private configService: ConfigService,
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
      const data = await this.useradapter
        .buildUserAdapter()
        .findUserDetails(null, username, tenantId);

      return APIResponse.success(
        response,
        apiId,
        data,
        HttpStatus.OK,
        "User fetched by auth token Successfully."
      );
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

  private generateToken(length: number): string {
    const crypto = require('crypto');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      token += chars[randomBytes[i] % chars.length];
    }
    return token;
  }

  async requestMagicLink(requestDto: RequestMagicLinkDto, response: Response) {
    const apiId = APIID.REQUEST_MAGIC_LINK;
    const expiryMinutes = this.configService.get<number>('MAGIC_LINK_EXPIRY_MINUTES', 15);
    const tokenLength = parseInt(this.configService.get<string>('MAGIC_LINK_TOKEN_LENGTH', '16'));    try {
      LoggerUtil.debug(`RequestMagicLink start: identifier=${requestDto.identifier}`, 'AuthService.requestMagicLink');
      if (requestDto.identifier === undefined || requestDto.identifier === null) {
        return APIResponse.error(
          response,
          apiId,
          "Bad Request",
          "Identifier is required.",
          HttpStatus.BAD_REQUEST
        );
      }
      if (requestDto.identifier.trim() === '') {
        return APIResponse.error(
          response,
          apiId,
          "Bad Request",
          "Identifier cannot be empty.",
          HttpStatus.BAD_REQUEST
        );
      }
      const user = await this.useradapter.findUserByIdentifier(requestDto.identifier);
      LoggerUtil.debug(`User lookup: ${user ? 'found ' + user.userId : 'not found'}`, 'AuthService.requestMagicLink');
      if (!user) {
        return APIResponse.error(
          response,
          apiId,
          "User Not Found",
          "Invalid identifier. User does not exist in the system.",
          HttpStatus.NOT_FOUND
        );
      }

      // Invalidate any previously generated and unused magic links for this user
      await this.magicLinkRepository.update(
        { userId: user.userId, is_used: false },
        { is_used: true }
      );

      let token: string;
      while (true) {
        token = this.generateToken(tokenLength);
        const existingToken = await this.magicLinkRepository.findOne({ where: { token } });
        if (!existingToken) break;
      }
      LoggerUtil.debug(`Generated magic token=${token}`, 'AuthService.requestMagicLink');

      const identifierType = requestDto.identifier.includes('@')
        ? 'email'
        : (/^\d+$/.test(requestDto.identifier) ? 'phone' : 'username');
    
      const magicLink = this.magicLinkRepository.create({
        token,
        identifier: requestDto.identifier,
        userId: user.userId,
        identifier_type: identifierType,
        redirect_url: requestDto.redirectUrl,
        notification_channel: requestDto.notificationChannel,
        expires_at: new Date(Date.now() + expiryMinutes * 60 * 1000),
        is_used: false,
        is_expired: false,
      });

      await this.magicLinkRepository.save(magicLink);
      LoggerUtil.debug(`Magic link saved: channel=${requestDto.notificationChannel}`, 'AuthService.requestMagicLink');

      
      try {
        await this.sendMagicLinkNotification(requestDto.identifier, token, requestDto.notificationChannel, requestDto.redirectUrl);      } catch (notificationError) {
        LoggerUtil.error('Magic link notification failed', notificationError?.message, 'AuthService.requestMagicLink');
        return APIResponse.success(
          response,
          apiId,
          { success: true, message: 'Magic link created; notification failed' },
          HttpStatus.OK,
          'Magic link created but notification failed'
        );
      }

      LoggerUtil.debug('RequestMagicLink success', 'AuthService.requestMagicLink');
      return APIResponse.success(
        response,
        apiId,
        { success: true, message: `Magic link sent to your ${identifierType}. It will expire in ${expiryMinutes} minutes.` },
        HttpStatus.OK,
        'Magic link request processed successfully'
      );
    } catch (error) {
      LoggerUtil.error('RequestMagicLink failed', error?.message, 'AuthService.requestMagicLink');
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

  async validateMagicLink(token: string, response: Response): Promise<Response> {
    const apiId = APIID.VALIDATE_MAGIC_LINK;
    const singleUse = this.configService.get<string>('MAGIC_LINK_SINGLE_USE', 'true');
    const isSingleUse = JSON.parse(singleUse.toLowerCase());
    try {
      LoggerUtil.debug(`ValidateMagicLink start: token=${token}`, 'AuthService.validateMagicLink');
      const magicLink = await this.magicLinkRepository.findOne({ where: { token } });
      if (!magicLink) throw new NotFoundException('Invalid magic link');
      if (isSingleUse && magicLink.is_used) throw new UnauthorizedException('Magic link has already been used');
      if (magicLink.is_expired || new Date() > magicLink.expires_at) {
        magicLink.is_expired = true;
        await this.magicLinkRepository.save(magicLink);
        throw new UnauthorizedException('Magic link has expired');
      }

      magicLink.is_used = true;
      await this.magicLinkRepository.save(magicLink);

      // Use DB userId (Keycloak UUID) directly for token-exchange
      const keycloakUserId = magicLink.userId;
      if (!keycloakUserId) throw new UnauthorizedException('User missing Keycloak UUID');

      const kc = await this.keycloakService.exchangeTokenForUser(keycloakUserId);
      return APIResponse.success(
        response,
        apiId,
        {
          access_token: kc.access_token,
          refresh_token: kc.refresh_token,
          expires_in: kc.expires_in,
          redirect_url: magicLink.redirect_url,
        },
        HttpStatus.OK,
        'Magic link validated successfully'
      );
    } catch (error) {
      LoggerUtil.error('validateMagicLink failed', error?.message, 'AuthService.validateMagicLink');
      const errorMessage = error?.message || "Something went wrong";
      let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      if (error instanceof NotFoundException) {
        statusCode = HttpStatus.NOT_FOUND;
      } else if (error instanceof UnauthorizedException) {
        statusCode = HttpStatus.UNAUTHORIZED;
      }
      return APIResponse.error(
        response,
        apiId,
        error?.name || "Internal Server Error",
        `Error : ${errorMessage}`,
        statusCode
      );
    }
  }

  private async sendMagicLinkNotification(
    identifier: string, 
    token: string, 
    channel: string, 
    redirectUrl?: string
  ): Promise<void> {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/?$/, '');
    const isPhone = /^\d+$/.test(identifier);
    const magicLinkPath = isPhone ? `/magic-link/${identifier}/${token}` : `/magic-link/${token}`;
    const magicLinkUrl = `${baseUrl}${magicLinkPath}`;
    const finalUrl = redirectUrl ? `${magicLinkUrl}?redirect=${encodeURIComponent(redirectUrl)}` : magicLinkUrl;
    LoggerUtil.debug(`Notify channel=${channel}, url=${finalUrl}`, 'AuthService.sendMagicLinkNotification');

    if (channel === 'email') {
      await this.notificationService.sendEmail(identifier, 'Magic Link', `Magic Link: ${finalUrl}`);
      LoggerUtil.debug('Email notification sent', 'AuthService.sendMagicLinkNotification');
      return;
    }

    if (channel === 'sms') {
      const smsPayload = {
        isQueue: false,
        context: "MAGIC_LINK",
        key: "Magic_Link_SMS",
        replacements: { "{magic_link}": finalUrl, "{expiry_time}": "15 minutes" },
        sms: { receipients: [identifier] },
      };
      await this.notificationService.sendNotification(smsPayload);
      LoggerUtil.debug('SMS notification sent', 'AuthService.sendMagicLinkNotification');
      return;
    }

    if (channel === 'whatsapp') {
      const whatsappPayload = {
        whatsapp: {
          to: [`+91${identifier}`],
          templateId: process.env.WHATSAPP_TEMPLATE_ID || "magic_link_template",
          templateParams: [finalUrl],
          gupshupSource: process.env.WHATSAPP_GUPSHUP_SOURCE,
          gupshupApiKey: process.env.WHATSAPP_GUPSHUP_API_KEY,
        },
      };
      await this.notificationService.sendRawNotification(whatsappPayload);
      LoggerUtil.debug('WhatsApp notification sent', 'AuthService.sendMagicLinkNotification');
      return;
    }

    throw new Error(`Unsupported notification channel: ${channel}`);
  }
}
