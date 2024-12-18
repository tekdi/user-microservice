import {
  Controller, Headers, Post, UseFilters, UsePipes, Req,
  Res, ValidationPipe,
  BadRequestException,
  Body
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiBasicAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiInternalServerErrorResponse, ApiTags } from '@nestjs/swagger';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { isUUID } from 'class-validator';
import { Response, Request } from 'express';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { CohortAcademicYearDto } from './dto/cohort-academicyear.dto';
import { CohortAcademicYearAdapter } from './cohortacademicyearsadaptor';

@ApiTags("CohortAcademicYear")
@Controller('cohort-academic-year')
export class CohortAcademicYearController {

  constructor(private readonly cohortAcademicYearAdapter: CohortAcademicYearAdapter) { }

  @UseFilters(new AllExceptionsFilter(APIID.ADD_COHORT_TO_ACADEMIC_YEAR))
  @Post("/create")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Form has been created successfully." })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: CohortAcademicYearDto })
  @ApiHeader({
    name: "tenantid",
  })
  public async createCohortAcademicYear(
    @Headers() headers,
    @Req() request: Request,
    @Body() cohortAcademicYearDto: CohortAcademicYearDto,
    @Res() response: Response
  ) {
    let tenantId = headers["tenantid"];
    if (tenantId && !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.cohortAcademicYearAdapter.buildAcademicYears().createCohortAcademicYear(tenantId, request, cohortAcademicYearDto, response);
  }
}
