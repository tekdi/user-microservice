import {
  BadRequestException,
  Headers,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  SerializeOptions,
  UseFilters,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from "@nestjs/common";
import { FormsService } from "./forms.service";
import {
  ApiBadRequestResponse,
  ApiBasicAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AllExceptionsFilter } from "src/common/filters/exception.filter";
import { FormCreateDto } from "./dto/form-create.dto";
import { APIID } from "@utils/api-id.config";
import { isUUID } from "class-validator";
import { API_RESPONSES } from "@utils/response.messages";
import { GetUserId } from "src/common/decorators/getUserId.decorator";
import { Request, Response } from "express";

@Controller("form")
@ApiTags("Forms")
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get("/read")
  @ApiCreatedResponse({ description: "Form Data Fetch" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiQuery({ name: "context", required: false })
  @ApiQuery({ name: "contextType", required: false })
  @ApiHeader({ name: "tenantId", required: false })
  @UsePipes(new ValidationPipe({ transform: true }))
  public async getFormData(
    @Req() request: Request,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const tenantId = request.headers["tenantid"];
    const normalizedQuery = {
      ...query,
      context: query.context?.toUpperCase(),
      contextType: query.contextType?.toUpperCase(),
    };

    const requiredData = { ...normalizedQuery, tenantId: tenantId || null };
    return await this.formsService.getForm(requiredData, response);
  }

  @UseFilters(new AllExceptionsFilter(APIID.FORM_CREATE))
  @Post("/create")
  @ApiBasicAuth("access-token")
  @ApiCreatedResponse({ description: "Form has been created successfully." })
  @ApiBadRequestResponse({ description: "Bad request." })
  @ApiInternalServerErrorResponse({ description: "Internal Server Error." })
  @UsePipes(new ValidationPipe())
  @ApiBody({ type: FormCreateDto })
  @ApiHeader({
    name: "tenantid",
  })
  public async createCohort(
    @Headers() headers,
    @Req() request: Request,
    @Body() formCreateDto: FormCreateDto,
    @Res() response: Response,
    @GetUserId("userId", ParseUUIDPipe) userId: string,
  ) {
    const tenantId = headers["tenantid"];
    formCreateDto.createdBy = userId;

    if (tenantId && !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    formCreateDto.tenantId = tenantId;
    return await this.formsService.createForm(request, formCreateDto, response);
  }
}
