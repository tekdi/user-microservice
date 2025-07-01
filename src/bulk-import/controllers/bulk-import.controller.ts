import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Headers,
  Req,
  Res,
  HttpStatus,
  UseFilters,
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
    name: 'x-tenant-id',
    description: 'Tenant ID',
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
    @Headers('x-tenant-id') tenantId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const batchId = uuidv4();
    try {
      const result = await this.bulkImportService.processBulkImport(
        file,
        bulkImportDto.cohortId,
        tenantId,
        req,
        res,
      );

      BulkImportLogger.logImportEnd(batchId, {
        totalProcessed: result.totalProcessed,
        successCount: result.successCount,
        failureCount: result.failureCount,
      });

      return APIResponse.success(
        res,
        APIID.USER_BULK_IMPORT,
        result,
        HttpStatus.OK,
        API_RESPONSES.BULK_IMPORT_SUCCESS
      );
    } catch (error) {
      BulkImportLogger.logFileParsingError(batchId, error);
      return APIResponse.error(
        res,
        APIID.USER_BULK_IMPORT,
        error.message || API_RESPONSES.BULK_IMPORT_FAILURE,
        error.message || 'Failed to process bulk import',
        HttpStatus.BAD_REQUEST
      );
    }
  }
} 