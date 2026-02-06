import {
  Body,
  Controller,
  Post,
  Res,
  Headers,
  UsePipes,
  ValidationPipe,
  UseFilters,
  BadRequestException,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBasicAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { AcademicYearDto } from "./dto/academicyears-create.dto";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { DateValidationPipe } from "src/common/pipes/date-validation.pipe";
import { isUUID } from "class-validator";
import { AcademicYearSearchDto } from "./dto/academicyears-search.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { AcademicYearService } from "./academicyears.service";

@ApiTags("Academicyears")
@Controller("academicyears")
@UseGuards(JwtAuthGuard)
export class AcademicyearsController {
  constructor(private readonly academicYearService: AcademicYearService) {}

  @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_CREATE))
  @Post("/create")
  @ApiBasicAuth("access-token")
  @UsePipes(new ValidationPipe({ transform: true }), new DateValidationPipe())
  @ApiBody({ type: AcademicYearDto })
  @ApiCreatedResponse({ description: API_RESPONSES.ACADEMICYEAR })
  @ApiHeader({ name: "tenantid" })
  async createAcademicYears(
    @Body() academicyearsService: AcademicYearDto,
    @Res() response: Response,
    @Headers() headers
  ) {
    const tenantId = headers["tenantid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const result = await this.academicYearService
      .createAcademicYear(academicyearsService, tenantId, response);
    return response.status(result.statusCode).json(result);
  }

  @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_LIST))
  @Post("/list")
  @ApiBasicAuth("access-token")
  @UsePipes(new ValidationPipe({ transform: true }))
  @ApiHeader({ name: "tenantid" })
  @ApiBody({ type: AcademicYearSearchDto })
  @ApiCreatedResponse({ description: API_RESPONSES.ACADEMICYEAR })
  async getAcademicYearList(
    @Body() academicYearSearchDto: AcademicYearSearchDto,
    @Res() response: Response,
    @Headers() headers
  ) {
    const tenantId = headers["tenantid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const result = await this.academicYearService
      .getAcademicYearList(academicYearSearchDto, tenantId, response);
    return response.status(result.statusCode).json(result);
  }

  @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_GET))
  @Get("/:id")
  @ApiBasicAuth("access-token")
  @ApiResponse({
    status: 200,
    description: API_RESPONSES.ACADEMICYEAR_GET_SUCCESS,
  })
  @ApiInternalServerErrorResponse({
    description: API_RESPONSES.INTERNAL_SERVER_ERROR,
  })
  async getAcademicYearById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() response: Response
  ) {
    const result = await this.academicYearService
      .getAcademicYearById(id, response);
    return response.status(result.statusCode).json(result);
  }
}
