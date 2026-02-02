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
  async requestMagicLink(
    @Body() requestMagicLinkDto: RequestMagicLinkDto,
    @Res() response: Response
  ) {
    return this.authService.requestMagicLink(requestMagicLinkDto, response);
  }

  @Get('/validate-magic-link/:token')
  @UseFilters(new AllExceptionsFilter(APIID.VALIDATE_MAGIC_LINK))
  @ApiOkResponse({ type: MagicLinkResponseDto })
  @ApiParam({ name: 'token', description: 'Magic link token' })
  @ApiQuery({ name: 'redirect', required: false, description: 'URL to redirect after successful validation' })
  async validateMagicLink(
    @Param('token') token: string,
    @Res() response: Response,
    @Query('redirect') redirect: string,
  ) {
    LoggerUtil.debug(`Redirecting to: ${redirect}`, 'AuthService.validateMagicLink');
    const validationResponse = await this.authService.validateMagicLink(token, response);
    if (redirect && validationResponse.statusCode === HttpStatus.OK) {
      response.redirect(redirect);
      return;
    }
    return validationResponse;
  }
}
