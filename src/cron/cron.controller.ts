import {
  Controller,
  Post,
  Res,
  UseGuards,
  UseFilters,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBasicAuth, ApiOkResponse, ApiInternalServerErrorResponse } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { RbacAuthGuard } from "src/common/guards/rbac.guard";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { CronService } from "./cron.service";
import APIResponse from "src/common/responses/response";
import { APIID } from "src/common/utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";

@ApiTags("Cron")
@Controller("cron")
export class CronController {
  constructor(private readonly cronService: CronService) {}

  @Post("navapatham/assign-students")
  @ApiOkResponse({ description: "Cron job executed successfully" })
  @ApiInternalServerErrorResponse({ description: "Internal server error" })
  async triggerAssignStudents(@Res() response: Response) {
    const apiId = APIID.CRON_NAVAPATHAM_ASSIGN;
    try {
      // Execute the cron job manually
      await this.cronService.assignStudentsToBatches();
      
      return APIResponse.success(
        response,
        apiId,
        { message: "Cron job executed successfully" },
        HttpStatus.OK,
        "Cron job completed"
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message || "Failed to execute cron job",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post("pragyanpath/map-users")
  @ApiOkResponse({ description: "Pragyanpath user mapping cron job executed successfully" })
  @ApiInternalServerErrorResponse({ description: "Internal server error" })
  async triggerMapPrathaUsers(@Res() response: Response) {
    const apiId = APIID.CRON_PRAGYANPATH_MAP_USERS;
    try {
      // Execute the cron job manually
      await this.cronService.mapPrathaUsersToTenant();
      
      return APIResponse.success(
        response,
        apiId,
        { message: "Pragyanpath user mapping cron job executed successfully" },
        HttpStatus.OK,
        "Cron job completed"
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message || "Failed to execute pragyanpath mapping cron job",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
