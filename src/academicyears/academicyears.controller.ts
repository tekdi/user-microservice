import { Body, Controller, Post, Res, Headers, UsePipes, ValidationPipe, UseFilters, BadRequestException, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiInternalServerErrorResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from "express";
import { AcademicYearDto } from './dto/academicyears-create.dto';
import { AcademicYearAdapter } from './academicyearsadaptor';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { DateValidationPipe } from 'src/common/pipes/date-validation.pipe';
import { isUUID } from 'class-validator';
import { AcademicYearSearchDto } from './dto/academicyears-search.dto';


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
            throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
        }
        let result = await this.academicYearAdapter.buildAcademicYears().createAcademicYear(academicyearsService, tenantId, response)
        return response.status(result.statusCode).json(result);
    }

    @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_LIST))
    @Post('/list')
    @UsePipes(new ValidationPipe({ transform: true }))
    @ApiHeader({ name: "tenantid" })
    @ApiBody({ type: AcademicYearSearchDto })
    @ApiCreatedResponse({ description: API_RESPONSES.ACADEMICYEAR })
    async getAcademicYearList(@Body() academicYearSearchDto: AcademicYearSearchDto, @Res() response: Response, @Headers() headers) {
        const tenantId = headers["tenantid"];
        if (!tenantId || !isUUID(tenantId)) {
            throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
        }
        let result = await this.academicYearAdapter.buildAcademicYears().getAcademicYearList(academicYearSearchDto, tenantId, response)
        return response.status(result.statusCode).json(result);
    }

    @UseFilters(new AllExceptionsFilter(APIID.ACADEMICYEAR_GET))
    @Get('/:id')
    @ApiResponse({ status: 200, description: API_RESPONSES.ACADEMICYEAR_GET_SUCCESS })
    @ApiInternalServerErrorResponse({
        description: API_RESPONSES.INTERNAL_SERVER_ERROR,
    })
    async getAcademicYearById(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Res() response: Response,
    ) {
        let result = await this.academicYearAdapter.buildAcademicYears().getAcademicYearById(id, response)
        return response.status(result.statusCode).json(result);
    }
}
