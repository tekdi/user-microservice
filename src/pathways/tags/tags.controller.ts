import {
  Controller,
  Post,
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
  BadRequestException,
  UseGuards,
  Req,
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
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { DeleteTagDto } from './dto/delete-tag.dto';
import { ListTagDto } from './dto/list-tag.dto';
import { Response, Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/keycloak.guard';
import { API_RESPONSES } from '@utils/response.messages';
import { isUUID } from 'class-validator';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    name?: string;
    username?: string;
    [key: string]: any;
  };
}

@ApiTags('Tags')
@Controller('tag')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) { }

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new tag',
    description:
      'Creates a new tag with the provided name. Name must be unique.',
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
    type: CreateTagDto,
    examples: {
      tag: {
        summary: 'Create a tag',
        value: {
          name: 'Networking',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Tag created successfully',
    schema: {
      example: {
        id: 'a1b2c3d4-e111-2222-3333-444455556666',
        name: 'Networking',
        status: 'published',
        created_at: '2026-02-10T12:30:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConflictResponse({ description: 'Tag with this name already exists' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(
    @Body() createTagDto: CreateTagDto,
    @Headers('tenantid') tenantId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const userId = request.user?.userId || null;
    return this.tagsService.create(createTagDto, userId, response);
  }

  @Patch('update/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a tag',
    description:
      'Updates a tag with the provided fields. Name must be unique if changed.',
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
    description: 'Tag UUID',
    type: String,
    format: 'uuid',
  })
  @ApiBody({
    type: UpdateTagDto,
    examples: {
      update: {
        summary: 'Update tag name and status',
        value: {
          name: 'Professional Networking',
          status: 'published',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tag updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request - Invalid UUID format' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiConflictResponse({ description: 'Tag with this name already exists' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTagDto: UpdateTagDto,
    @Headers('tenantid') tenantId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    const userId = request.user?.userId || null;
    return this.tagsService.update(id, updateTagDto, userId, response);
  }

  @Post('delete/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a tag (Soft Delete)',
    description:
      'Soft deletes a tag by setting its status to archived. Archived tags are excluded from list API by default.',
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
    description: 'Tag UUID to delete (soft delete - sets status to archived)',
    type: String,
    format: 'uuid',
  })
  @ApiBody({
    type: DeleteTagDto,
    examples: {
      delete: {
        summary: 'Archive a tag',
        value: {
          updated_by: 'a1b2c3d4-e111-2222-3333-444455556666',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tag archived successfully',
    schema: {
      example: {
        id: 'a1b2c3d4-e111-2222-3333-444455556666',
        status: 'archived',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad Request - Invalid UUID format' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deleteTagDto: DeleteTagDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    // Ensure ID from path matches ID in body if provided, or prioritize path ID
    deleteTagDto.id = id;
    return this.tagsService.delete(deleteTagDto, response);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List tags',
    description:
      'Retrieves a list of tags with optional filtering by status and pagination. Archived tags are excluded by default.',
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
    type: ListTagDto,
    required: false,
    examples: {
      all: {
        summary: 'List all published tags',
        value: {},
      },
      byStatus: {
        summary: 'List tags by status',
        value: {
          status: 'published',
        },
      },
      paginated: {
        summary: 'List tags with pagination',
        value: {
          status: 'published',
          limit: 10,
          offset: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tags retrieved successfully',
  })
  @ApiBadRequestResponse({ description: 'Bad Request' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal Server Error' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(
    @Body() listTagDto: ListTagDto,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    return this.tagsService.list(listTagDto, tenantId, response);
  }

  @Post('fetch/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch tag by ID',
    description: 'Retrieves a specific tag by its UUID.',
  })
  @ApiGetByIdCommon()
  @ApiParam({
    name: 'id',
    description: 'Tag UUID',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Tag retrieved successfully',
  })
  async fetch(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('tenantid') tenantId: string,
    @Res() response: Response
  ): Promise<Response> {
    if (!tenantId || !isUUID(tenantId)) {
      throw new BadRequestException(API_RESPONSES.TENANTID_VALIDATION);
    }
    // RESTful approach: Use only path parameter
    return this.tagsService.fetch({ id }, response);
  }
}
