import { Controller, Get, Query, Req, Res, SerializeOptions, UsePipes, ValidationPipe } from '@nestjs/common';
import { FormsService } from './forms.service';
import { ApiCreatedResponse, ApiForbiddenResponse, ApiQuery } from '@nestjs/swagger';

@Controller('form')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get("/read")
  @ApiCreatedResponse({ description: "Form Data Fetch" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @SerializeOptions({
    strategy: "excludeAll",
  })
  @ApiQuery({ name: 'context', required: false })
  @ApiQuery({ name: 'contextType', required: false })
  @UsePipes(new ValidationPipe({ transform: true }))
  public async getFormData(
    @Req() request: Request,
    @Query() query: Record<string, any>,
    @Res() response: Response
  ) {
    let tenantId = request.headers['tenantid'];
    const requiredData = { ...query, tenantId: tenantId || null };
    return await this.formsService.getForm(requiredData,response);
  }

}
