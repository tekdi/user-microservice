import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseFilters,
  Res,
  Headers,
  BadRequestException,
  Req,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { FormSubmissionService } from '../services/form-submission.service';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { FormSubmissionStatus } from '../entities/form-submission.entity';
import { JwtAuthGuard } from '../../common/guards/keycloak.guard';
import { AllExceptionsFilter } from '../../common/filters/exception.filter';
import { APIID } from '../../common/utils/api-id.config';
import { Response, Request } from 'express';
import { isUUID } from 'class-validator';
import { API_RESPONSES } from '../../common/utils/response.messages';
import { FormSubmissionSearchDto } from '../dto/form-submission-search.dto';
import APIResponse from '../../common/responses/response';

@ApiTags('Form Submissions')
@Controller('forms/submissions')
@UseGuards(JwtAuthGuard)
export class FormSubmissionController {
  constructor(private readonly formSubmissionService: FormSubmissionService) {}

  @Post()
  @UseFilters(new AllExceptionsFilter(APIID.FORM_SUBMISSION_CREATE))
  @ApiOperation({ summary: 'Create a new form submission' })
  @ApiBody({ type: CreateFormSubmissionDto })
  @ApiHeader({ name: 'tenantid', required: true })
  @ApiResponse({
    status: 201,
    description: 'Form submission created successfully',
  })
  async create(
    @Body() createFormSubmissionDto: CreateFormSubmissionDto,
    @Res() response: Response,
    @Headers('tenantid') tenantId: string,
    @Headers() headers,
    @Req() request: Request
  ) {
    try {
      if (!tenantId || !isUUID(tenantId)) {
        throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
      }

      // Only validate cohortAcademicYearId if cohortMember object is present
      if (createFormSubmissionDto.cohortMember) {
        if (
          !createFormSubmissionDto.cohortAcademicYearId ||
          !isUUID(createFormSubmissionDto.cohortAcademicYearId)
        ) {
          throw new BadRequestException(
            'cohortAcademicYearId is required in the request body when creating a cohort member'
          );
        }
      }

      createFormSubmissionDto.tenantId = tenantId;
      const result = await this.formSubmissionService.create(
        createFormSubmissionDto,
        createFormSubmissionDto.cohortAcademicYearId
      );

      // Set appropriate success message based on whether cohort member was created
      const successMessage = createFormSubmissionDto.cohortMember
        ? 'Form saved successfully and cohort member has been assigned'
        : 'Form saved successfully';

      return response.status(HttpStatus.CREATED).json({
        id: 'api.form.submission.create',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: result.formSubmission.submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: successMessage
        },
        responseCode: HttpStatus.CREATED,
        result
      });
    } catch (error) {
      return APIResponse.error(
        response,
        'api.form.submission.create',
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search form submissions with filters and pagination',
  })
  @ApiBody({ type: FormSubmissionSearchDto })
  findAll(@Body() searchDto: FormSubmissionSearchDto) {
    return this.formSubmissionService.findAll(searchDto);
  }

  @Get(':id')
  @UseFilters(new AllExceptionsFilter(APIID.FORM_SUBMISSION_GET))
  @ApiOperation({ summary: 'Get a form submission by ID' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id') id: string) {
    return this.formSubmissionService.findOne(id);
  }

  @Patch(':id')
  @UseFilters(new AllExceptionsFilter(APIID.FORM_SUBMISSION_UPDATE))
  @ApiOperation({ summary: 'Update a form submission' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateFormSubmissionDto })
  @ApiHeader({ name: 'tenantid', required: true })
  async update(
    @Param('id') id: string,
    @Body() updateFormSubmissionDto: UpdateFormSubmissionDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ) {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }

    const result = await this.formSubmissionService.update(
      id,
      updateFormSubmissionDto,
      tenantId
    );
    return response.status(result.responseCode).json(result);
  }

  @Delete(':id')
  @UseFilters(new AllExceptionsFilter(APIID.FORM_SUBMISSION_DELETE))
  @ApiOperation({ summary: 'Delete/Archive a form submission' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'mode',
    enum: ['soft', 'hard'],
    description:
      'Delete mode - soft (archive) or hard (permanent delete). Defaults to soft delete if not specified.',
    required: false,
  })
  async remove(
    @Param('id') id: string,
    @Query('mode') mode: 'soft' | 'hard' = 'soft'
  ) {
    return this.formSubmissionService.remove(id, mode);
  }
}
