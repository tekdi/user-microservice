import {
  ApiTags,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiBasicAuth,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  SerializeOptions,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  UsePipes,
  ValidationPipe,
  UseGuards,
  UseFilters,
  Query,
  Param,
  Headers
} from "@nestjs/common";
import {
  AuthDto,
  RefreshTokenRequestBody,
  LogoutRequestBody,
} from "./dto/auth-dto";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { APIID } from "src/common/utils/api-id.config";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { Response } from "express";
import { MagicLinkResponseDto, RequestMagicLinkDto } from "./dto/magic-link.dto";
import { LoggerUtil } from "src/common/logger/LoggerUtil";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseFilters(new AllExceptionsFilter(APIID.LOGIN))
  @Post("/login")
  @ApiBody({ type: AuthDto })
  @UsePipes(ValidationPipe)
  @HttpCode(HttpStatus.OK)
  @ApiForbiddenResponse({ description: "Forbidden" })
  public async login(@Body() authDto: AuthDto, @Res() response: Response) {
    return this.authService.login(authDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.USER_AUTH))
  @Get("/")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  @ApiOkResponse({ description: "User detail." })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({
    strategy: "excludeAll",
  })
  public async getUserByAuth(@Req() request, @Res() response: Response) {
    const tenantId = request?.headers["tenantid"];
    return this.authService.getUserByAuth(request, tenantId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.REFRESH))
  @Post("/refresh")
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshTokenRequestBody })
  @UsePipes(ValidationPipe)
  refreshToken(
    @Body() body: RefreshTokenRequestBody,
    @Res() response: Response
  ) {
    const { refresh_token: refreshToken } = body;

    return this.authService.refreshToken(refreshToken, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.LOGOUT))
  @Post("/logout")
  @UsePipes(ValidationPipe)
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LogoutRequestBody })
  async logout(@Body() body: LogoutRequestBody, @Res() response: Response) {
    const { refresh_token: refreshToken } = body;

    await this.authService.logout(refreshToken, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.REQUEST_MAGIC_LINK))
  @Post("/request-magic-link")
  @ApiBody({ type: RequestMagicLinkDto })
  @UsePipes(ValidationPipe)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ 
    description: "Magic link request processed", 
    type: MagicLinkResponseDto 
  })
  async requestMagicLink(
    @Body() requestDto: RequestMagicLinkDto,
    @Res() response: Response
  ): Promise<any> {
    return this.authService.requestMagicLink(requestDto, response);
  }

  @Get("/magic-link/:token")
  @ApiParam({ name: 'token', description: 'Magic link token' })
  @ApiQuery({ name: 'redirect', description: 'Encoded redirect URL', required: false })
  async validateMagicLink(
    @Res() res: Response,
    @Param('token') token: string,
    @Query('redirect') redirect?: string,
    @Headers('accept') accept?: string
  ) {
    const wantsJson = accept?.includes('application/json');
    
    try {
      const result = await this.authService.validateMagicLink(token, redirect);
      const baseRedirect = redirect 
        ? redirect 
        : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/success`;
       
      if (wantsJson) {
        return res.status(200).json({
          success: true,
          message: 'Magic link validated successfully',
          data: {
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            expires_in: result.expires_in,
            redirect_url: baseRedirect
          }
        });
      }
        
      return res.redirect(302, baseRedirect);
      
    } catch (error) {
      LoggerUtil.error('Magic link validation failed', error?.message, 'AuthController.validateMagicLink');
      
      if (wantsJson) {
        return res.status(error.status || 500).json({
          success: false,
          error: error.message,
          statusCode: error.status || 500,
          timestamp: new Date().toISOString()
        });
      }
      
      const errorUrl = redirect 
        ? `${redirect}?error=${encodeURIComponent(error.message)}`
        : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=${encodeURIComponent(error.message)}`;
      
      return res.redirect(302, errorUrl);
    }
  }
}
