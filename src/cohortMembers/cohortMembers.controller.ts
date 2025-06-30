import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiQuery,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  SerializeOptions,
  Req,
  Headers,
  Res,
  UsePipes,
  ValidationPipe,
  Query,
  UseFilters,
  BadRequestException,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { CohortMembersSearchDto } from './dto/cohortMembers-search.dto';
import { CohortMembersDto } from './dto/cohortMembers.dto';
import { CohortMembersAdapter } from './cohortMembersadapter';
import { CohortMembersUpdateDto } from './dto/cohortMember-update.dto';
import { Response } from 'express';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from 'src/common/utils/api-id.config';
import { BulkCohortMember } from './dto/bulkMember-create.dto';
import { isUUID } from 'class-validator';
import { API_RESPONSES } from '@utils/response.messages';
import APIResponse from 'src/common/responses/response';
import { ShortlistingLogger } from 'src/common/logger/ShortlistingLogger';
import { CohortMembersCronService } from './cohortMembers-cron.service';

// Extend Express Request type to include user
interface RequestWithUser extends Request {
  user?: {
    sub: string;
    userId: string;
    name: string;
    username: string;
    [key: string]: any;
  };
}

@ApiTags('Cohort Member')
@Controller('cohortmember')
// @UseGuards(JwtAuthGuard)
export class CohortMembersController {
  constructor(
    private readonly cohortMemberAdapter: CohortMembersAdapter,
    private readonly cohortMembersCronService: CohortMembersCronService
  ) {}

  //create cohort members
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_CREATE))
  @Post('/create')
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({
    description: 'Cohort Member has been created successfully.',
  })
  @ApiBody({ type: CohortMembersDto })
  @ApiHeader({
    name: 'tenantid',
  })
  @ApiHeader({
    name: 'academicyearid',
  })
  @ApiHeader({
    name: 'deviceid',
  })
  public async createCohortMembers(
    @Headers() headers,
    @Req() request,
    @Query('userId') userId: string,
    @Body() cohortMembersDto: CohortMembersDto,
    @Res() response: Response
  ) {
    const loginUser = userId;
    const tenantId = headers['tenantid'];
    const deviceId = headers['deviceid'];
    const academicyearId = headers['academicyearid'];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        'academicyearId is required and academicyearId must be a valid UUID.'
      );
    }
    if (!loginUser || !isUUID(loginUser)) {
      throw new BadRequestException('unauthorized!');
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .createCohortMembers(
        loginUser,
        cohortMembersDto,
        response,
        tenantId,
        deviceId,
        academicyearId
      );
    return response.status(result.statusCode).json(result);
  }

  //get cohort members
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_GET))
  @Get('/read/:cohortId')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Cohort Member detail' })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @SerializeOptions({ strategy: 'excludeAll' })
  @ApiHeader({ name: 'tenantid' })
  @ApiQuery({
    name: 'fieldvalue',
    description: 'Send True to Fetch Custom Field of User',
    required: false,
  })
  @ApiHeader({
    name: 'academicyearid',
  })
  public async getCohortMembers(
    @Headers() headers,
    @Param('cohortId') cohortId: string,
    @Req() request: Request,
    @Res() response: Response,
    @Query('fieldvalue') fieldvalue: string | null = null
  ) {
    const tenantId = headers['tenantid'];
    const academicyearId = headers['academicyearid'];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        'academicyearId is required and academicyearId must be a valid UUID.'
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .getCohortMembers(
        cohortId,
        tenantId,
        fieldvalue,
        academicyearId,
        response
      );
  }

  // search;
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_SEARCH))
  @Post('/list')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Cohort Member list.' })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiBody({ type: CohortMembersSearchDto })
  @UsePipes(new ValidationPipe())
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  @ApiHeader({
    name: 'academicyearid',
  })
  public async searchCohortMembers(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() cohortMembersSearchDto: CohortMembersSearchDto
  ) {
    const tenantId = headers['tenantid'];
    const academicyearId = headers['academicyearid'];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        'academicyearId is required and must be a valid UUID.'
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .searchCohortMembers(
        cohortMembersSearchDto,
        tenantId,
        academicyearId,
        response
      );
  }

  //update
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_UPDATE))
  @Put('/update/:cohortmembershipid')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({
    description: 'Cohort Member has been updated successfully.',
  })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiBody({ type: CohortMembersUpdateDto })
  @UsePipes(new ValidationPipe())
  public async updateCohortMembers(
    @Param('cohortmembershipid') cohortMembersId: string,
    @Req() request,
    @Body() cohortMemberUpdateDto: CohortMembersUpdateDto,
    @Res() response: Response,
    @Query('userId') userId: string
  ) {
    const loginUser = userId;
    if (!loginUser || !isUUID(loginUser)) {
      throw new BadRequestException('unauthorized!');
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .updateCohortMembers(
        cohortMembersId,
        loginUser,
        cohortMemberUpdateDto,
        response
      );
  }

  //delete
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_DELETE))
  @Delete('/delete/:id')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Cohort member deleted successfully' })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  public async deleteCohortMember(
    @Headers() headers,
    @Param('id') cohortMembershipId: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const tenantid = headers['tenantid'];

    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .deleteCohortMemberById(tenantid, cohortMembershipId, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_CREATE))
  @Post('/bulkCreate')
  @ApiBody({ type: BulkCohortMember })
  @UsePipes(new ValidationPipe())
  // @ApiBasicAuth("access-token")
  @ApiHeader({
    name: 'tenantid',
    required: true,
  })
  @ApiHeader({
    name: 'academicyearid',
    required: true,
  })
  @ApiQuery({
    name: 'userId',
    required: true,
    type: 'string',
    description: 'userId required',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiCreatedResponse({
    description: 'Cohort Member has been created successfully.',
  })
  public async createBulkCohortMembers(
    @Headers() headers,
    @Req() request,
    @Body() bulkCohortMembersDto: BulkCohortMember,
    @Query('userId') userId: string, // Now using userId from query
    @Res() response: Response
  ) {
    const loginUser = userId;
    const tenantId = headers['tenantid'];
    const academicyearId = headers['academicyearid'];
    if (!loginUser || !isUUID(loginUser)) {
      throw new BadRequestException('unauthorized!');
    }
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        'academicyearId is required and must be a valid UUID.'
      );
    }
    const result = await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .createBulkCohortMembers(
        loginUser,
        bulkCohortMembersDto,
        response,
        tenantId,
        academicyearId
      );
    return result;
  }

  //Get Cohort Members with Application
  @UseFilters(new AllExceptionsFilter(APIID.COHORT_MEMBER_SEARCH))
  @Post('/list-application')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Cohort Member list.' })
  @ApiNotFoundResponse({ description: 'Data not found' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiBody({ type: CohortMembersSearchDto })
  @UsePipes(new ValidationPipe())
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  @ApiHeader({
    name: 'academicyearid',
  })
  public async listWithApplication(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Body() cohortMembersSearchDto: CohortMembersSearchDto
  ) {
    const tenantId = headers['tenantid'];
    const academicyearId = headers['academicyearid'];
    if (!academicyearId || !isUUID(academicyearId)) {
      throw new BadRequestException(
        'academicyearId is required and must be a valid UUID.'
      );
    }
    await this.cohortMemberAdapter
      .buildCohortMembersAdapter()
      .listWithApplication(
        cohortMembersSearchDto,
        tenantId,
        academicyearId,
        response
      );
  }

  /**
   * Manual trigger endpoint for cohort member shortlisting evaluation
   * Allows immediate processing of shortlisting evaluation for testing or urgent processing
   *
   * This endpoint:
   * 1. Validates required headers (tenantid, academicyearid)
   * 2. Triggers the shortlisting evaluation process
   * 3. Returns detailed performance metrics and processing results
   *
   * The evaluation process:
   * - Fetches active cohorts with shortlist date = today
   * - Processes submitted members in parallel batches
   * - Evaluates form rules against user field values
   * - Updates member status to 'shortlisted' or 'rejected'
   * - Sends email notifications based on results
   * - Logs failures for manual review
   *
   * Performance: Can handle 100k+ records per cohort with optimized parallel processing
   *
   * @param req - Express request object containing headers
   * @param res - Express response object
   * @returns JSON response with processing results and performance metrics
   */
  @Post('cron/evaluate-shortlisting-status')
  async evaluateShortlistingStatus(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('userid') queryUserId?: string
  ) {
    const apiId = APIID.COHORT_MEMBER_EVALUATE_SHORTLISTING;

    try {
      // Extract required headers for tenant and academic year context
      const tenantId = req.headers['tenantid'] as string;
      const academicyearId = req.headers['academicyearid'] as string;
      const headerUserId = req.headers['userid'] as string;

      // Use query parameter if header is not available
      const userId = headerUserId || queryUserId;

      if (!userId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          'User ID not found in request. Please ensure you are authenticated.',
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate required headers
      if (!tenantId) {
        return APIResponse.error(
          res,
          apiId,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.TANANT_ID_REQUIRED,
          HttpStatus.BAD_REQUEST
        );
      }

      if (!academicyearId) {
        return APIResponse.error(
          res,
          apiId,
          'Academic year ID is required in headers',
          API_RESPONSES.BAD_REQUEST,
          HttpStatus.BAD_REQUEST
        );
      }

      // Validate UUID format for both parameters
      if (!isUUID(tenantId)) {
        return APIResponse.error(
          res,
          apiId,
          'Invalid tenant ID format. Must be a valid UUID.',
          API_RESPONSES.BAD_REQUEST,
          HttpStatus.BAD_REQUEST
        );
      }

      if (!isUUID(academicyearId)) {
        return APIResponse.error(
          res,
          apiId,
          'Invalid academic year ID format. Must be a valid UUID.',
          API_RESPONSES.BAD_REQUEST,
          HttpStatus.BAD_REQUEST
        );
      }

      // Trigger the shortlisting evaluation process with user ID
      const result =
        await this.cohortMembersCronService.triggerShortlistingEvaluation(
          tenantId,
          academicyearId,
          userId
        );

      // Return success response with the result data
      return APIResponse.success(
        res,
        apiId,
        result,
        HttpStatus.OK,
        'Cohort member shortlisting evaluation completed successfully'
      );
    } catch (error) {
      // Log the error for debugging and monitoring
      ShortlistingLogger.logShortlistingError(
        'Error in manual shortlisting evaluation endpoint',
        `Error: ${error.message}`,
        apiId
      );

      // Return error response
      return APIResponse.error(
        res,
        apiId,
        `Error: ${error.message}`,
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
