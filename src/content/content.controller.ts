import {
  Controller,
  Post,
  Body,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  BadRequestException,
  Patch,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
  ApiParam,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ListContentDto } from './dto/list-content.dto';
import { isUUID } from 'class-validator';
import { API_RESPONSES } from '@utils/response.messages';

@ApiTags('Content')
@Controller('content') // Assuming global prefix user/v1 applies
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Update existing content',
    description: 'Updates an existing content entry with the provided information.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant UUID',
    required: true,
  })
  @ApiParam({ name: 'id', description: 'Content UUID' })
  @ApiBody({ type: UpdateContentDto })
  @ApiResponse({
    status: 200,
    description: 'Content updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiNotFoundResponse({ description: 'Content not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response,
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    if (!id || !isUUID(id)) {
      throw new BadRequestException(API_RESPONSES.UUID_VALIDATION);
    }
    return this.contentService.update(id, updateContentDto, response);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List content',
    description: 'Retrieves a list of content based on filters and pagination.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant UUID',
    required: true,
  })
  @ApiBody({ type: ListContentDto })
  @ApiResponse({
    status: 200,
    description: 'Content list retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(
    @Body() listContentDto: ListContentDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response,
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.contentService.list(listContentDto, response);
  }

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new content',
    description: 'Creates a new content entry with the provided information.',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for authentication',
    required: true,
  })
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant UUID',
    required: true,
  })
  @ApiBody({ type: CreateContentDto })
  @ApiResponse({
    status: 201,
    description: 'Content created successfully',
    schema: {
      example: {
        id: 'api.Content.create',
        ver: '1.0',
        ts: '2026-02-13T12:14:33.626Z',
        params: {
          resmsgid: '3ad71ea5-68ce-4576-a1c0-a1a4b8474916',
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Content created successfully',
        },
        responseCode: 201,
        result: {
          id: '484299ec-317c-446a-a61d-58904e05be47',
          name: 'Cricket',
          alias: 'cricket',
          isActive: true,
          createdAt: '2026-02-13T06:44:32.540Z',
          createdBy: 'fa023e44-7bcf-43fc-9099-7ca4193a985f',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiConflictResponse({ description: 'Alias already exists' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createContentDto: CreateContentDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response,
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.contentService.create(createContentDto, response);
  }
}
