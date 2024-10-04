import { Body, Controller, Post, Res, Headers, UsePipes, ValidationPipe, UseFilters, BadRequestException } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Response } from "express";
import { AcademicYearDto } from './dto/academicyears-create.dto';
import { AcademicYearAdapter } from './academicyearsadaptor';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { DateValidationPipe } from 'src/common/pipes/date-validation.pipe';
import { isUUID } from 'class-validator';


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
        if (!tenantId || !isUUID(tenantId)) {
            throw new BadRequestException('Tenant ID is required and must be a valid UUID.');
        }
        let result = await this.academicYearAdapter.buildAcademicYears().createAcademicYear(academicyearsService, tenantId, response)
        return response.status(result.statusCode).json(result);
    }
}
