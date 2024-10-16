import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  SerializeOptions,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { FormsService } from "./forms.service";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";

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
    @Res() response: Response
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
}
