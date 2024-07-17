import {
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  BadRequestException,
  Res,
} from "@nestjs/common";
import { AuthRbacService } from "./authRbac.service";
import { ApiBasicAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { isUUID } from "class-validator";
import { Response } from "express";

@ApiTags("AuthRbac")
@Controller("auth/rbac")
export class AuthRbacController {
  constructor(private authService: AuthRbacService) {}

  @HttpCode(HttpStatus.OK)
  @Get("/token")
  @ApiHeader({
    name: "tenantid",
    required: true,
    description: "Tenant Id",
  })
  @ApiBasicAuth("access-token")
  @UseGuards(JwtAuthGuard)
  signInRbac(@Req() req, @Res() response: Response) {
    const tenantId = req.headers["tenantid"];
    if (!isUUID(tenantId)) {
      throw new BadRequestException("Please add valid Tenant ID");
      // return APIResponse.error(response, apiId, "Bad Request", `Error : ${apiResponse?.errors}`, HttpStatus.BAD_REQUEST);
    }
    return this.authService.signInRbac(req.user.username, tenantId, response);
  }
}
