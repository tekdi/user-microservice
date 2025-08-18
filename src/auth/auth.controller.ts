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
  Param,
  Query,
  Redirect,
} from "@nestjs/common";
import {
  AuthDto,
  RefreshTokenRequestBody,
  LogoutRequestBody,
} from "./dto/auth-dto";
import { 
  RequestMagicLinkDto, 
  MagicLinkResponseDto,
  MagicLinkValidationDto 
} from "./dto/magic-link.dto";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { APIID } from "src/common/utils/api-id.config";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { Response } from "express";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService
  ) {}

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
    const org_id = request?.headers["org_id"];    
    return this.authService.getUserByAuth(request, org_id, response);
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
  @Redirect()
  async validateMagicLink(
    @Param('token') token: string,
    @Query('redirect') redirect?: string
  ) {
    try {
      const result = await this.authService.validateMagicLink(token, redirect);
      
      // Redirect to frontend with tokens
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/success#access_token=${result.access_token}&refresh_token=${result.refresh_token}&expires_in=${result.expires_in}`;
      
      return { url: redirectUrl };
    } catch (error) {
      // Redirect to error page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return { url: `${frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}` };
    }
  }
}
