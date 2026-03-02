import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseFilters,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AllExceptionsFilter } from '../common/filters/exception.filter';
import { APIID } from '../common/utils/api-id.config';
import { PaymentService } from './services/payment.service';
import { InitiatePaymentDto } from './dtos/initiate-payment.dto';
import { OverridePaymentStatusDto } from './dtos/override-payment-status.dto';
import { PaymentStatusResponseDto } from './dtos/payment-status.dto';
import { PaymentReportResponseDto } from './dtos/payment-report.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private paymentService: PaymentService) {}

  @Post('initiate')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_INITIATE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a payment' })
  @ApiBody({ type: InitiatePaymentDto })
  @ApiCreatedResponse({
    description: 'Payment initiated successfully',
    schema: {
      type: 'object',
      properties: {
        paymentIntentId: { type: 'string', format: 'uuid' },
        checkoutUrl: { type: 'string', format: 'url' },
        sessionId: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid payment data' })
  async initiatePayment(@Body() dto: InitiatePaymentDto) {
    return await this.paymentService.initiatePayment(dto);
  }

  @Patch('transactions/:transactionId/status/override')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS_OVERRIDE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Manually override payment status by transaction ID',
    description:
      'Same as override by payment intent ID but identified by transaction ID. Resolves the payment intent from the transaction, then overrides intent and all its transactions. When set to PAID, targets are unlocked and certificate generation is triggered if applicable.',
  })
  @ApiBody({ type: OverridePaymentStatusDto })
  @ApiOkResponse({
    description: 'Payment status overridden successfully',
    type: PaymentStatusResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid transaction or status' })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async overridePaymentStatusByTransactionId(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: OverridePaymentStatusDto,
  ) {
    return await this.paymentService.overridePaymentStatusByTransactionId(
      transactionId,
      dto.status,
      dto.reason,
    );
  }

  @Get(':id/status')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS))
  @ApiOperation({ summary: 'Get payment status' })
  @ApiOkResponse({
    description: 'Payment status retrieved successfully',
    type: PaymentStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Payment intent not found' })
  async getPaymentStatus(@Param('id', ParseUUIDPipe) paymentIntentId: string) {
    return await this.paymentService.getPaymentStatus(paymentIntentId);
  }

  @Patch(':id/status/override')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS_OVERRIDE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Manually override payment status',
    description:
      'Override payment intent and transaction status. When set to PAID, targets are unlocked and certificate generation is triggered if applicable. Use for admin/support corrections.',
  })
  @ApiBody({ type: OverridePaymentStatusDto })
  @ApiOkResponse({
    description: 'Payment status overridden successfully',
    type: PaymentStatusResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid payment intent or status' })
  @ApiNotFoundResponse({ description: 'Payment intent not found' })
  async overridePaymentStatus(
    @Param('id', ParseUUIDPipe) paymentIntentId: string,
    @Body() dto: OverridePaymentStatusDto,
  ) {
    return await this.paymentService.overridePaymentStatus(
      paymentIntentId,
      dto.status,
      dto.reason,
    );
  }

  @Get('report/:contextId')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS))
  @ApiOperation({ summary: 'Get payment report by contextId with pagination' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of records to return (default: 50, max: 1000)',
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default: 0)',
    example: 0,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Free text search on firstName, lastName, and email (case-insensitive)',
    example: 'john',
  })
  @ApiOkResponse({
    description: 'Payment report retrieved successfully',
    type: PaymentReportResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  async getPaymentReport(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('search') search?: string,
  ): Promise<PaymentReportResponseDto> {
    // Validate pagination parameters
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Limit must be between 1 and 1000');
    }
    if (offset < 0) {
      throw new BadRequestException('Offset must be non-negative');
    }

    const searchTerm = typeof search === 'string' ? search.trim() : undefined;

    const result = await this.paymentService.getPaymentReportByContextId(
      contextId,
      limit,
      offset,
      searchTerm,
    );

    return {
      data: result.data,
      totalCount: result.totalCount,
      limit,
      offset,
      hasMore: offset + result.data.length < result.totalCount,
    };
  }
}
