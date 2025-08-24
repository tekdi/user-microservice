import {
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

  @Get("health")
  getHealth(): object {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "user-microservice",
    };
  }

  @Get("files/:fileName")
  seeUploadedFile(@Param("fileName") fileName: string, @Res() res) {
    return res.sendFile(fileName, { root: "./uploads" });
  }
}
