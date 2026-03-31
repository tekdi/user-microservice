import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  Headers,
} from "@nestjs/common";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./common/guards/keycloak.guard";
import { ApiBasicAuth, ApiHeader } from "@nestjs/swagger";
import { RbacAuthGuard } from "./common/guards/rbac.guard";
import * as path from "path";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @UseGuards(RbacAuthGuard, JwtAuthGuard)
  @ApiHeader({
    name: "rbac_token",
  })
  @ApiBasicAuth("access-token")
  getHello(@Headers() headers): object {
    return this.appService.getHello();
  }

  @Get("files/:fileName")
  seeUploadedFile(@Param("fileName") fileName: string, @Res() res) {
    const sanitizedFileName = path.basename(fileName);
    if (sanitizedFileName !== fileName) {
      throw new BadRequestException("Invalid file name");
    }
    return res.sendFile(sanitizedFileName, { root: "./uploads" });
  }
}
