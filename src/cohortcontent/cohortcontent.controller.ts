import {
  Controller,
  Post,
  Put,
  Body,
  UseGuards,
  Res,
  Headers,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { isUUID } from "class-validator";
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import {
  CohortContentDto,
  UpdateCohortContentDto,
} from "./dto/cohort-content.dto";
import { CohortContentService } from "./cohortcontent.service";

@ApiTags("Cohort Content")
@Controller("cohortcontent")
@UseGuards(JwtAuthGuard)
export class CohortcontentController {
  constructor(private readonly cohortContentService: CohortContentService) {}

  @Post()
  @ApiBody({ type: CohortContentDto })
  @ApiCreatedResponse({ description: "Cohort content created" })
  async create(
    @Body() createCohortContentDto: CohortContentDto,
    @Res() response: Response,
    @Headers() headers
  ) {
    const tenantId = headers["tenantid"];
    if (tenantId && !isUUID(tenantId)) {
      throw new BadRequestException("Please add valid Tenant ID");
    }
    createCohortContentDto.tenantId = tenantId;
    return await this.cohortContentService.create(
      createCohortContentDto,
      response
    );
  }

  @Put()
  @ApiBody({ type: UpdateCohortContentDto })
  async update(
    @Body() updateCohortContentDto: UpdateCohortContentDto,
    @Res() response: Response,
    @Headers() headers
  ) {
    const tenantId = headers["tenantid"];
    if (tenantId && !isUUID(tenantId)) {
      throw new BadRequestException("Please add valid Tenant ID");
    }
    updateCohortContentDto.tenantId = tenantId;
    return await this.cohortContentService.update(
      updateCohortContentDto,
      response
    );
  }

  @Post("search")
  @ApiBody({ schema: { properties: { filter: { type: "object" } } } })
  async search(@Body("filter") filter: any, @Res() response: Response, @Headers() headers) {
    const tenantId = headers["tenantid"];
    if (tenantId && !isUUID(tenantId)) {
      throw new BadRequestException("Please add valid Tenant ID");
    }
    const normalizedFilter = { ...(filter || {}), tenantId };
    return await this.cohortContentService.search(normalizedFilter, response);
  }
}
