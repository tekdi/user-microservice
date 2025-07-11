import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Headers,
  Req,
  HttpStatus,
  UseFilters,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiHeader,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BulkImportDto } from '../dto/bulk-import.dto';
import { BulkImportService } from '../services/bulk-import.service';
import { AllExceptionsFilter } from '../../common/filters/exception.filter';
import { APIID } from '../../common/utils/api-id.config';
import APIResponse from '../../common/responses/response';
import { API_RESPONSES } from '../../common/utils/response.messages';
import { BulkImportLogger } from '../../common/logger/BulkImportLogger';
import { v4 as uuidv4 } from 'uuid';

@Controller('bulk-import')
@ApiTags('Bulk Import')
@UseFilters(new AllExceptionsFilter(APIID.USER_BULK_IMPORT))
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Post('users')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: BulkImportDto,
    description: 'Bulk import users from CSV/XLSX file',
  })
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant ID',
    required: true,
  })
  @ApiHeader({
    name: 'academicyearid',
    description: 'Academic Year ID',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Users imported successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
  })
  @ApiInternalServerErrorResponse({
    description: 'Internal server error',
  })
  async bulkImportUsers(
    @UploadedFile() file: Express.Multer.File,
    @Body() bulkImportDto: BulkImportDto,
    @Headers('tenantid') tenantId: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const batchId = uuidv4();

    try {
      // The service will handle logging and response formatting
      const result = await this.bulkImportService.processBulkImport(
        file,
        bulkImportDto.cohortId,
        tenantId,
        req,
        res
      );

      return result;
    } catch (error) {
      // Log the error with the batch ID for easier tracking
      throw error;
    }
  }

  // Generate XLSX Template for Cohort
  @Post('xlsx-template')
  @ApiHeader({
    name: 'tenantid',
    description: 'Tenant ID',
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cohortId: {
          type: 'string',
          description: 'Cohort ID to generate template for',
        },
      },
      required: ['cohortId'],
    },
  })
  @ApiCreatedResponse({
    description: 'Template columns generated successfully',
  })
  @ApiBadRequestResponse({
    description: 'Cohort not active or form not found',
  })
  async generateXlsxTemplate(
    @Body('cohortId') cohortId: string,
    @Headers('tenantid') tenantId: string
  ) {
    return await this.bulkImportService.generateXlsxTemplateColumns(
      cohortId,
      tenantId
    );
  }
}
