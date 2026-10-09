import {
  ApiTags,
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiBasicAuth,
  ApiOkResponse,
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
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
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
import { PasswordEncryptionService } from "src/common/services/password-encryption.service";
import APIResponse from "src/common/responses/response";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordEncryptionService: PasswordEncryptionService
  ) {}

  @UseFilters(new AllExceptionsFilter(APIID.LOGIN))
  @UseGuards(ThrottlerGuard)
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

  @UseFilters(new AllExceptionsFilter(APIID.AUTH_PUBLIC_KEY))
  @Get("/public-key")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "RSA public key used to encrypt sensitive fields." })
  public async getPublicKey(@Res() response: Response) {
    const result = {
      keyId: this.passwordEncryptionService.getKeyId(),
      publicKey: this.passwordEncryptionService.getPublicKey(),
    };

    return APIResponse.success(
      response,
      APIID.AUTH_PUBLIC_KEY,
      result,
      HttpStatus.OK,
      "Public key fetched successfully."
    );
  }
}
