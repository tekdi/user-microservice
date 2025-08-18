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
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MagicLink } from "./entities/magic-link.entity";
import { RequestMagicLinkDto } from "./dto/magic-link.dto";
import { JwtService } from "@nestjs/jwt";
import { NotificationRequest } from "src/common/utils/notification.axios";

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

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 16; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  async requestMagicLink(requestDto: RequestMagicLinkDto, response: Response) {
    const apiId = APIID.REQUEST_MAGIC_LINK;
    try {
      console.log(`[DEBUG] AuthService: Requesting magic link for identifier: ${requestDto.identifier}`);
      
      // First check if user exists - if not, throw error immediately
      const user = await this.useradapter.findUserByIdentifier(requestDto.identifier);
      console.log(`[DEBUG] AuthService: User search result:`, user ? `User found: ${user.userId}` : 'No user found');
      
      if (!user) {
        console.log(`[DEBUG] AuthService: User not found, returning 404 error`);
        return APIResponse.error(
          response,
          apiId,
          "User Not Found",
          "Invalid identifier. User does not exist in the system.",
          HttpStatus.NOT_FOUND
        );
      }

      // Generate unique token
      let token: string;
      let isUnique = false;
      while (!isUnique) {
        token = this.generateToken();
        const existingToken = await this.magicLinkRepository.findOne({ where: { token } });
        if (!existingToken) {
          isUnique = true;
        }
      }

      // Determine identifier type
      let identifierType = 'username';
      if (requestDto.identifier.includes('@')) {
        identifierType = 'email';
      } else if (/^\d+$/.test(requestDto.identifier)) {
        identifierType = 'phone';
      }

      // Create magic link record
      const magicLink = this.magicLinkRepository.create({
        token,
        identifier: requestDto.identifier,
        identifier_type: identifierType,
        redirect_url: requestDto.redirectUrl,
        notification_channel: requestDto.notificationChannel,
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes expiry
        is_used: false,
        is_expired: false,
      });

      await this.magicLinkRepository.save(magicLink);

      // Send notification based on channel using notification microservice
      try {
        await this.sendMagicLinkNotification(requestDto.identifier, token, requestDto.notificationChannel, requestDto.redirectUrl);
      } catch (notificationError) {
        // Log the notification error but don't fail the request
        console.error('Failed to send magic link notification:', notificationError);
        
        // Still return success since the magic link was created
        return APIResponse.success(
          response,
          apiId,
          { 
            success: true, 
            message: 'Magic link created successfully but notification failed. Please contact support.',
            token: token // Include token for debugging if needed
          },
          HttpStatus.OK,
          'Magic link created but notification failed'
        );
      }

      return APIResponse.success(
        response,
        apiId,
        { success: true, message: 'Magic link sent successfully' },
        HttpStatus.OK,
        'Magic link request processed successfully'
      );
    } catch (error) {
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

  async validateMagicLink(token: string, redirect?: string) {
    try {
      const magicLink = await this.magicLinkRepository.findOne({ where: { token } });

      if (!magicLink) {
        throw new NotFoundException('Invalid magic link');
      }

      if (magicLink.is_used) {
        throw new UnauthorizedException('Magic link has already been used');
      }

      if (magicLink.is_expired || new Date() > magicLink.expires_at) {
        // Mark as expired
        magicLink.is_expired = true;
        await this.magicLinkRepository.save(magicLink);
        throw new UnauthorizedException('Magic link has expired');
      }

      // Find user
      const user = await this.useradapter.findUserByIdentifier(magicLink.identifier);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Mark magic link as used
      magicLink.is_used = true;
      await this.magicLinkRepository.save(magicLink);

      // Generate JWT tokens
      const payload = { 
        sub: user.userId, 
        email: user.email, 
        username: user.username,
        tenantId: null // User entity doesn't have tenant_id, it's in userTenantMapping
      };

      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });

      return {
        access_token,
        refresh_token,
        expires_in: 3600
      };
    } catch (error) {
      throw error;
    }
  }

  private async sendMagicLinkNotification(
    identifier: string, 
    token: string, 
    channel: string, 
    redirectUrl?: string
  ): Promise<void> {
    const magicLinkUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/magic-link/${token}`;
    
    let finalUrl = magicLinkUrl;
    if (redirectUrl) {
      const encodedRedirect = encodeURIComponent(redirectUrl);
      finalUrl = `${magicLinkUrl}?redirect=${encodedRedirect}`;
    }

    const message = `Magic Link: ${finalUrl}`;

    try {
      switch (channel) {
        case 'email':
          // Send email notification using notification microservice
          await this.notificationService.sendEmail(identifier, 'Magic Link', message);
          break;
        case 'sms':
          // Send SMS notification using the same approach as OTP method
          // Format phone number with +91 prefix like the OTP method does
          const formattedSmsPhone = `+91${identifier}`;
          console.log(`[DEBUG] Magic Link SMS - Original identifier: ${identifier}, Formatted phone: ${formattedSmsPhone}`);
          
          // Use the same SMS payload format as your working OTP method
          // Note: OTP method passes original number, smsNotification handles formatting
          const smsPayload = {
            isQueue: false,
            context: "MAGIC_LINK",
            key: "Magic_Link_SMS",
            replacements: {
              "{magic_link}": finalUrl,
              "{expiry_time}": "15 minutes"
            },
            sms: {
              receipients: [identifier], // Use original number like OTP method
            },
          };
          
          console.log(`[DEBUG] Magic Link SMS payload:`, JSON.stringify(smsPayload, null, 2));
          
          try {
            const result = await this.notificationService.sendNotification(smsPayload);
            console.log(`[DEBUG] SMS API response:`, JSON.stringify(result, null, 2));
          } catch (smsError) {
            console.error(`[DEBUG] SMS API error:`, smsError);
            throw smsError;
          }
          break;
        case 'whatsapp':
          // Send WhatsApp notification using the same direct approach as OTP
          // Format phone number with +91 prefix like the OTP method does
          const formattedPhone = `+91${identifier}`;
          // Try to use the same template that works for OTP, or fallback to a simple one
          const templateId = process.env.WHATSAPP_TEMPLATE_ID || "magic_link_template";
          
          // For debugging: let's try both the current template and a fallback
          console.log(`[DEBUG] Using WhatsApp template ID: ${templateId}`);
          
          // Create a shorter, more template-friendly message
          const shortMessage = `Click here: ${finalUrl}`;
          
          const whatsappPayload = {
            whatsapp: {
              to: [formattedPhone],
              templateId: templateId,
              templateParams: [finalUrl], // OTP template expects only 1 parameter
              gupshupSource: process.env.WHATSAPP_GUPSHUP_SOURCE,
              gupshupApiKey: process.env.WHATSAPP_GUPSHUP_API_KEY,
            },
          };
          
          // Debug: Log the exact template parameters being sent
          console.log(`[DEBUG] WhatsApp Template Parameters:`, {
            templateId: templateId,
            param1: finalUrl,
            totalParams: 1
          });
          console.log(`[DEBUG] Magic Link WhatsApp payload:`, JSON.stringify(whatsappPayload, null, 2));
          console.log(`[DEBUG] Original identifier: ${identifier}, Formatted phone: ${formattedPhone}`);
          
          try {
            console.log(`[DEBUG] About to call sendRawNotification with payload:`, JSON.stringify(whatsappPayload, null, 2));
            const result = await this.notificationService.sendRawNotification(whatsappPayload);
            console.log(`[DEBUG] WhatsApp API response:`, JSON.stringify(result, null, 2));
          } catch (whatsappError) {
            console.error(`[DEBUG] WhatsApp API error:`, whatsappError);
            console.error(`[DEBUG] Error details:`, {
              message: whatsappError.message,
              status: whatsappError.status,
              response: whatsappError.response
            });
            throw whatsappError;
          }
          break;
        default:
          throw new Error(`Unsupported notification channel: ${channel}`);
      }
    } catch (error) {
      console.error(`Failed to send ${channel} notification:`, error);
      throw error; // Re-throw to handle in calling method
    }
  }

  async cleanupExpiredLinks(): Promise<void> {
    try {
      const expiredLinks = await this.magicLinkRepository
        .createQueryBuilder('magicLink')
        .where('magicLink.expires_at < :now', { now: new Date() })
        .andWhere('magicLink.is_expired = :isExpired', { isExpired: false })
        .getMany();

      for (const link of expiredLinks) {
        link.is_expired = true;
        await this.magicLinkRepository.save(link);
      }
    } catch (error) {
      console.error('Failed to cleanup expired links:', error);
    }
  }
}
