import { Body, Controller, Post, Req, Res, Headers, UsePipes, ValidationPipe, UseFilters } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
// import { AcademicyearsService } from './academicyearsadaptor';
import { Request, Response } from "express";
import { AcademicYearDto } from './dto/academicyears-create.dto';
import { AcademicYearAdapter } from './academicyearsadaptor';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { DateValidationPipe } from 'src/common/pipes/date-validation.pipe';


@ApiTags("Academicyears")
@Controller('academicyears')
export class AcademicyearsController {

    constructor(private readonly academicYearAdapter: AcademicYearAdapter) { }

    @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_CREATE))
    @Post('/create')
    @UsePipes(new ValidationPipe({ transform: true }), new DateValidationPipe())
    @ApiBody({ type: AcademicYearDto })
    @ApiCreatedResponse({ description: API_RESPONSES.ACADEMICYEAR })
    @ApiHeader({ name: "tenantid" })
    async createAcademicYears(@Body() academicyearsService: AcademicYearDto,
        @Res() response: Response,
        @Headers() headers) {
        const tenantId = headers["tenantid"];
        let result = await this.academicYearAdapter.buildAcademicYears().createAcademicYear(academicyearsService, tenantId, response)
        return response.status(result.statusCode).json(result);
    }
}
