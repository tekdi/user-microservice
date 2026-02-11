import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
  ApiParam,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ApiGetByIdCommon } from '../common/decorators/api-common.decorator';
import { PathwaysService } from './pathways.service';
import { CreatePathwayDto } from './dto/create-pathway.dto';
import { UpdatePathwayDto } from './dto/update-pathway.dto';
import { ListPathwayDto } from './dto/list-pathway.dto';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { API_RESPONSES } from '@utils/response.messages';
import { isUUID } from 'class-validator';

@ApiTags('Pathways')
@Controller('pathway')
@UseGuards(JwtAuthGuard)
export class PathwaysController {
  constructor(private readonly pathwaysService: PathwaysService) {}

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new pathway',
    description:
      'Creates a new pathway with the provided information. Key must be unique.',
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
  @ApiBody({
    type: CreatePathwayDto,
    examples: {
      pathway: {
        summary: 'Standard pathway creation',
        value: {
          key: 'career_dev',
          name: 'Career Development',
          description: 'Build skills for corporate success and job placements.',
          tags: [
            'a1b2c3d4-e111-2222-3333-444455556666',
            'b2c3d4e5-f111-2222-3333-444455556777',
          ],
          display_order: 1,
          is_active: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Pathway created successfully',
    schema: {
      example: {
        id: 'c3b6e50e-40ab-4148-8ca9-3b2296ca11e5',
        key: 'career_dev',
        name: 'Career Development',
        description: 'Build skills for corporate success and job placements.',
        tag_ids: [
          'a1b2c3d4-e111-2222-3333-444455556666',
          'b2c3d4e5-f111-2222-3333-444455556777',
        ],
        display_order: 1,
        is_active: true,
        created_at: '2026-02-10T06:22:26.934Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Pathway with this key already exists' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createPathwayDto: CreatePathwayDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.create(createPathwayDto, response);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List pathways',
    description:
      'Retrieves a list of pathways, optionally filtered by active status.',
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
  @ApiBody({
    type: ListPathwayDto,
    required: false,
    examples: {
      active: {
        summary: 'List active pathways',
        value: {
          isActive: true,
        },
      },
      all: {
        summary: 'List all pathways',
        value: {},
      },
      paginated: {
        summary: 'List pathways with pagination',
        value: {
          isActive: true,
          limit: 10,
          offset: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'List of pathways retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(
    @Body() listPathwayDto: ListPathwayDto,
    @Headers('tenantid') tenantId: string,
    @Headers('organisationid') organisationId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    // organisationId is optional, use default if not provided
    const orgId = organisationId || process.env.DEFAULT_ORGANISATION_ID || '';
    return this.pathwaysService.list(listPathwayDto, tenantId, orgId, response);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get pathway by ID',
    description: 'Retrieves a specific pathway by its UUID.',
  })
  @ApiGetByIdCommon()
  @ApiParam({
    name: 'id',
    description: 'Pathway UUID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Pathway retrieved successfully',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.findOne(id, response);
  }

  @Patch('update/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update pathway',
    description: 'Partially updates a pathway with the provided fields.',
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
  @ApiParam({
    name: 'id',
    description: 'Pathway UUID',
    type: String,
    format: 'uuid',
  })
  @ApiBody({
    type: UpdatePathwayDto,
    examples: {
      update: {
        summary: 'Update pathway name',
        value: {
          name: 'Advanced Career Track',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Pathway updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request - Invalid UUID format' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Pathway not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePathwayDto: UpdatePathwayDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.pathwaysService.update(id, updatePathwayDto, response);
  }
}
