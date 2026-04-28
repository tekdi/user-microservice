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
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AllExceptionsFilter } from '../common/filters/exception.filter';
import { APIID } from '../common/utils/api-id.config';
import { PaymentService } from './services/payment.service';
import { InitiatePaymentDto } from './dtos/initiate-payment.dto';
import { OverridePaymentStatusDto } from './dtos/override-payment-status.dto';
import {
  PaymentStatusResponseDto,
  PaymentStatusesByUserContextResponseDto,
} from './dtos/payment-status.dto';
import { PaymentReportResponseDto } from './dtos/payment-report.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

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
  @ApiConflictResponse({
    description:
      'A completed (PAID) payment already exists for this user and context; includes alreadyPaid and paymentIntentId',
  })
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

  @Get('by-session')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS))
  @ApiOperation({
    summary: 'Get payment status by Stripe Checkout Session ID',
    description:
      'Use the session_id from the success URL (e.g. profile?session_id=cs_test_...) to get contextId, transaction details, and full payment status. Same response as GET :id/status.',
  })
  @ApiQuery({
    name: 'session_id',
    required: true,
    type: String,
    description: 'Stripe Checkout Session ID from success URL query param',
    example: 'cs_test_a1PRQRjSo2iGpwg8921beksc6sMDhMHhl9rZxBAVVkba6WWu8HUQD6fqGk',
  })
  @ApiOkResponse({
    description: 'Payment status retrieved successfully',
    type: PaymentStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'No payment found for the given session_id' })
  async getPaymentStatusBySession(@Query('session_id') sessionId: string) {
    return await this.paymentService.getPaymentStatusBySessionId(sessionId);
  }

  @Get('by-user-context')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS_BY_USER_CONTEXT))
  @ApiOperation({
    summary: 'Get payment status by userId and contextId',
    description:
      'Returns every payment intent for this user that includes a target with the given contextId (e.g. cohort/course id). Each element matches GET :id/status. Ordered by intent updatedAt descending (newest first).',
  })
  @ApiQuery({
    name: 'userId',
    required: true,
    type: String,
    description: 'User UUID',
  })
  @ApiQuery({
    name: 'contextId',
    required: true,
    type: String,
    description: 'Context UUID from payment target (e.g. cohort id)',
  })
  @ApiOkResponse({
    description: 'Payment statuses retrieved successfully',
    type: PaymentStatusesByUserContextResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No payment intent found for this user and context',
  })
  async getPaymentStatusByUserAndContext(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Query('contextId', ParseUUIDPipe) contextId: string,
  ) {
    return await this.paymentService.getPaymentStatusByUserIdAndContextId(
      userId,
      contextId,
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
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description:
      'Filter by transaction status. Accepts SUCCESS, INITIATED, FAILED (single value or comma-separated list)',
    example: 'SUCCESS,FAILED',
  })
  @ApiQuery({
    name: 'certificateGenerated',
    required: false,
    type: String,
    description:
      'Filter by certificate generation status for the given context (accepts true/false)',
    example: 'true',
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
    @Query('status') status?: string,
    @Query('certificateGenerated') certificateGenerated?: string,
  ): Promise<PaymentReportResponseDto> {
    // Validate pagination parameters
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Limit must be between 1 and 1000');
    }
    if (offset < 0) {
      throw new BadRequestException('Offset must be non-negative');
    }

    const searchTerm = typeof search === 'string' ? search.trim() : undefined;
    const normalizedStatuses =
      typeof status === 'string'
        ? status
            .split(',')
            .map((value) => value.trim().toUpperCase())
            .filter((value) => value.length > 0)
        : [];

    const allowedStatuses = new Set(['SUCCESS', 'INITIATED', 'FAILED']);
    const invalidStatuses = normalizedStatuses.filter(
      (value) => !allowedStatuses.has(value),
    );
    if (invalidStatuses.length > 0) {
      throw new BadRequestException(
        `Invalid status filter(s): ${invalidStatuses.join(', ')}. Allowed values are SUCCESS, INITIATED, FAILED`,
      );
    }

    const certificateGeneratedFilter =
      this.parseBooleanLikeQueryParam(certificateGenerated);

    const result = await this.paymentService.getPaymentReportByContextId(
      contextId,
      limit,
      offset,
      searchTerm,
      normalizedStatuses.length > 0 ? normalizedStatuses : undefined,
      certificateGeneratedFilter,
    );

    return {
      data: result.data,
      totalCount: result.totalCount,
      limit,
      offset,
      hasMore: offset + result.data.length < result.totalCount,
    };
  }

  private parseBooleanLikeQueryParam(value?: string): boolean | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return undefined;
    }

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }

    throw new BadRequestException(
      'certificateGenerated must be one of: true, false',
    );
  }
}
