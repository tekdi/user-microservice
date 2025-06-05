import {
  ApiTags,
  ApiBody,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiBasicAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import {
  Controller,
  Post,
  Body,
  SerializeOptions,
  Req,
  Headers,
  UseGuards,
  Res,
  UseFilters,
  Get,
  Query,
  Param,
  UsePipes,
  ValidationPipe,
  Patch,
  Delete,
} from '@nestjs/common';
import {
  FieldsOptionsSearchDto,
  FieldsSearchDto,
} from './dto/fields-search.dto';
import { Request } from '@nestjs/common';
import { FieldsDto } from './dto/fields.dto';
import { FieldsUpdateDto } from './dto/fields-update.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { FieldsAdapter } from './fieldsadapter';
import { FieldValuesDto } from './dto/field-values.dto';
import { FieldValuesSearchDto } from './dto/field-values-search.dto';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { AllExceptionsFilter } from 'src/common/filters/exception.filter';
import { APIID } from 'src/common/utils/api-id.config';

@ApiTags('Fields')
@Controller('fields')
export class FieldsController {
  constructor(private fieldsAdapter: FieldsAdapter) {}

  //fields
  //create fields
  @Post('/create')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @UsePipes(new ValidationPipe())
  @ApiCreatedResponse({ description: 'Fields has been created successfully.' })
  @ApiBody({ type: FieldsDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  public async createFields(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsDto: FieldsDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .createFields(request, fieldsDto, response);
  }

  //create fields
  @Patch('/update/:fieldId')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Fields has been created successfully.' })
  @ApiBody({ type: FieldsUpdateDto })
  @UsePipes(new ValidationPipe())
  @ApiForbiddenResponse({ description: 'Forbidden' })
  public async updateFields(
    @Param('fieldId') fieldId: string,
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsUpdateDto: FieldsUpdateDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .updateFields(fieldId, request, fieldsUpdateDto, response);
  }

  //search
  @Post('/search')
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Fields list.' })
  @ApiBody({ type: FieldsSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiHeader({
    name: 'tenantid',
  })
  public async searchFields(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsSearchDto: FieldsSearchDto,
    @Res() response: Response
  ) {
    const tenantid = headers['tenantid'];
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .searchFields(tenantid, request, fieldsSearchDto, response);
  }

  //field values
  //create fields values
  @UseFilters(new AllExceptionsFilter(APIID.FIELDVALUES_CREATE))
  @Post('/values/create')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({
    description: 'Fields Values has been created successfully.',
  })
  @ApiBody({ type: FieldValuesDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  public async createFieldValues(
    @Req() request: Request,
    @Body() fieldValuesDto: FieldValuesDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .createFieldValues(request, fieldValuesDto, response);
  }

  //search fields values
  @Post('/values/search')
  @ApiBasicAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Fields Values list.' })
  @ApiBody({ type: FieldValuesSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  // @UseInterceptors(ClassSerializerInterceptor)
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  public async searchFieldValues(
    @Req() request: Request,
    @Body() fieldValuesSearchDto: FieldValuesSearchDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .searchFieldValues(request, fieldValuesSearchDto, response);
  }

  //Get Field Option
  @Post('/options/read')
  @UsePipes(new ValidationPipe())
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Field Options list.' })
  @ApiBody({ type: FieldsOptionsSearchDto })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  public async getFieldOptions(
    @Headers() headers,
    @Req() request: Request,
    @Body() fieldsOptionsSearchDto: FieldsOptionsSearchDto,
    @Res() response: Response
  ) {
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .getFieldOptions(fieldsOptionsSearchDto, response);
  }

  //Delete Field Option
  @Delete('/options/delete/:fieldName')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Field Options Delete.' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiQuery({ name: 'context', required: null })
  @ApiQuery({ name: 'option', required: null })
  @ApiQuery({ name: 'contextType', required: null })
  public async deleteFieldOptions(
    @Headers() headers,
    @Req() request: Request,
    @Param('fieldName') fieldName: string,
    @Query('option') option: string | null = null,
    @Query('context') context: string | null = null,
    @Query('contextType') contextType: string | null = null,
    @Res() response: Response
  ) {
    const requiredData = {
      fieldName: fieldName || null,
      option: option || null,
      context: context || null,
      contextType: contextType || null,
    };
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .deleteFieldOptions(requiredData, response);
  }

  @Delete('/delete')
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth('access-token')
  @ApiCreatedResponse({ description: 'Delete field (soft or permanent).' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({ strategy: 'excludeAll' })
  @ApiQuery({ name: 'fieldId', required: false, type: String })
  @ApiQuery({ name: 'fieldName', required: false, type: String })
  @ApiQuery({
    name: 'softDelete',
    required: false,
    type: Boolean,
    description: 'true for soft delete (default), false for permanent delete',
  })
  public async deleteField(
    @Headers() headers,
    @Req() request: Request,
    @Res() response: Response,
    @Query('fieldId') fieldId?: string,
    @Query('fieldName') fieldName?: string,
    @Query('softDelete') softDelete?: string // no initializer here
  ) {
    const softDeleteValue = softDelete === undefined || softDelete === 'true'; // default true

    const requiredData = {
      fieldId: fieldId || null,
      fieldName: fieldName || null,
      softDelete: softDeleteValue,
    };

    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .deleteField(requiredData, response);
  }

  @Get('/formFields')
  @ApiCreatedResponse({ description: 'Form Data Fetch' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  @SerializeOptions({
    strategy: 'excludeAll',
  })
  @ApiQuery({ name: 'context', required: false })
  @ApiQuery({ name: 'contextType', required: false })
  public async getFormData(
    @Headers() headers,
    @Req() request: Request,
    @Query('context') context: string | null = null,
    @Query('contextType') contextType: string | null = null,
    @Res() response: Response
  ) {
    const requiredData = {
      context: context || false,
      contextType: contextType || false,
    };
    return await this.fieldsAdapter
      .buildFieldsAdapter()
      .getFormCustomField(requiredData, response);
  }
}
