import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
} from "@nestjs/swagger";
import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  UseInterceptors,
  SerializeOptions,
  Req,
  UploadedFile,
  Res,
  Headers,
  Delete,
  UseGuards,
  ValidationPipe,
  UsePipes,
  BadRequestException,
  UseFilters,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import { CohortSearchDto } from "./dto/cohort-search.dto";
import { Request } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { editFileName, imageFileFilter } from "./utils/file-upload.utils";
import { diskStorage } from "multer";
import { Response } from "express";
import { CohortAdapter } from "./cohortadapter";
import { CohortCreateDto } from "./dto/cohort-create.dto";
import { CohortUpdateDto } from "./dto/cohort-update.dto";
import { JwtAuthGuard } from "src/common/guards/keycloak.guard";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { APIID } from "src/common/utils/api-id.config";
import { isUUID } from "class-validator";
import { API_RESPONSES } from "@utils/response.messages";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { GetUserId } from "src/common/decorators/getUserId.decorator";

@ApiTags("Cohort")
@Controller("cohort")
@UseGuards(JwtAuthGuard)
export class CohortController {
  constructor(private readonly cohortAdapter: CohortAdapter) {}

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_READ))
  @Get("/cohortHierarchy/:cohortId")
  @ApiOkResponse({ description: "Cohort details Fetched Successfully" })
  @ApiNotFoundResponse({ description: "Cohort Not Found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @SerializeOptions({ strategy: "excludeAll" })
  @ApiQuery({ name: "children", required: false, type: Boolean })
  @ApiQuery({ name: "customField", required: false, type: Boolean })
  public async getCohortsDetails(
    @Headers() headers,
    @Param("cohortId") cohortId: string,
    @Res() response: Response,
    @Query("children") children: string,
    @Query("customField") customField: string
  ) {
    const academicYearId = headers["academicyearid"];
    const getChildDataValueBoolean = children === "true";
    const fieldValueBooelan = customField === "true";
    const requiredData = {
      cohortId: cohortId,
      academicYearId: academicYearId,
      getChildData: getChildDataValueBoolean,
      customField: fieldValueBooelan,
    };
    return await this.cohortAdapter
      .buildCohortAdapter()
      .getCohortsDetails(requiredData, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_CREATE))
  @Post("/create")
  @ApiCreatedResponse({ description: "Cohort has been created successfully." })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiConflictResponse({ description: "Cohort already exists." })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: CohortCreateDto })
  @ApiQuery({ name: "userId", required: false })
  @ApiHeader({
    name: "tenantid",
  })
  @ApiHeader({
    name: "academicyearid",
  })
  public async createCohort(
    @Headers() headers,
    @Req() request: Request,
    @Body() cohortCreateDto: CohortCreateDto,
    @UploadedFile() image,
    @Res() response: Response,
    @GetUserId("userId", ParseUUIDPipe) userId: string  
  ) {
      
    const tenantId = headers["tenantid"];
    const academicYearId = headers["academicyearid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicYearId || !isUUID(academicYearId)) {
      throw new BadRequestException(API_RESPONSES.ACADEMICYEARID_VALIDATION);
    }
    cohortCreateDto.createdBy = userId;
    LoggerUtil.log(`Creating cohort with userId: ${userId}`);

    cohortCreateDto.academicYearId = academicYearId;
    cohortCreateDto.tenantId = tenantId;
    cohortCreateDto.createdBy = userId;
    cohortCreateDto.updatedBy = userId;
    return await this.cohortAdapter
      .buildCohortAdapter()
      .createCohort(cohortCreateDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_LIST))
  @Post("/search")
  @ApiBody({ type: CohortSearchDto })
  @ApiOkResponse({ description: "Cohort list" })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @UsePipes(new ValidationPipe())
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiHeader({
    name: "tenantid",
  })
  @ApiHeader({
    name: "academicyearid",
  })
  public async searchCohort(
    @Headers() headers,
    @Req() request: Request,
    @Body() cohortSearchDto: CohortSearchDto,
    @Res() response: Response
  ) {
    const tenantId = headers["tenantid"];
    const academicYearId = headers["academicyearid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicYearId || !isUUID(academicYearId)) {
      throw new BadRequestException(API_RESPONSES.ACADEMICYEARID_VALIDATION);
    }
    return await this.cohortAdapter
      .buildCohortAdapter()
      .searchCohort(tenantId, academicYearId, cohortSearchDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_UPDATE))
  @Put("/update/:cohortId")
  @UseInterceptors(
    FileInterceptor("image", {
      storage: diskStorage({
        destination: process.env.IMAGEPATH,
        filename: editFileName,
      }),
      fileFilter: imageFileFilter,
    })
  )
  @ApiBody({ type: CohortUpdateDto })
  @ApiOkResponse({ description: "Cohort has been updated successfully" })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @UsePipes(new ValidationPipe({ transform: true }))
  public async updateCohort(
    @Param("cohortId") cohortId: string,
    @Req() request: Request,
    @Body() cohortUpdateDto: CohortUpdateDto,
    @UploadedFile() image,
    @Res() response: Response,
    @GetUserId("userId", ParseUUIDPipe) userId: string
  ) {
    cohortUpdateDto.updatedBy = userId;
    return await this.cohortAdapter
      .buildCohortAdapter()
      .updateCohort(cohortId, cohortUpdateDto, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_DELETE))
  @Delete("/delete/:cohortId")
  @ApiOkResponse({ description: "Cohort has been deleted successfully." })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  public async updateCohortStatus(
    @Param("cohortId") cohortId: string,
    @Res() response: Response,
    @GetUserId("userId", ParseUUIDPipe) userId: string
  ) {
    return await this.cohortAdapter
      .buildCohortAdapter()
      .updateCohortStatus(cohortId, response, userId);
  }

  @UseFilters(new AllExceptionsFilter(APIID.COHORT_READ))
  @Get("/mycohorts/:userId")
  @ApiOkResponse({ description: "Cohort details Fetched Successfully" })
  @ApiNotFoundResponse({ description: "User Not Found" })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @ApiBadRequestResponse({ description: "Bad Request" })
  @ApiHeader({ name: "tenantid" })
  @ApiHeader({
    name: "academicyearid",
  })
  @ApiQuery({ name: "children", required: false, type: Boolean })
  @ApiQuery({ name: "customField", required: false, type: Boolean })
  public async getCohortsHierarachyData(
    @Headers() headers,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Query("children") children: string,
    @Query("customField") customField: string | null = null,
    @Res() response: Response
  ) {
    const tenantId = headers["tenantid"];
    const academicYearId = headers["academicyearid"];
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!academicYearId || !isUUID(academicYearId)) {
      throw new BadRequestException(API_RESPONSES.ACADEMICYEARID_VALIDATION);
    }
    const getChildDataValueBoolean = children === "true";
    const fieldValueBooelan = customField === "true";
    const requiredData = {
      userId: userId,
      academicYearId: academicYearId,
      getChildData: getChildDataValueBoolean,
      customField: fieldValueBooelan,
    };
    return await this.cohortAdapter
      .buildCohortAdapter()
      .getCohortHierarchyData(requiredData, response);
  }
}
