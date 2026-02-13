import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseFilters,
  ParseUUIDPipe,
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
} from '@nestjs/swagger';
import { AllExceptionsFilter } from '../common/filters/exception.filter';
import { APIID } from '../common/utils/api-id.config';
import { PaymentService } from './services/payment.service';
import { InitiatePaymentDto } from './dtos/initiate-payment.dto';
import { PaymentStatusResponseDto } from './dtos/payment-status.dto';

@ApiTags('Payments')
@Controller('payment/session')
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
    console.log('initiatePayment-----------------------controller called');
    
    return await this.paymentService.initiatePayment(dto);
  }

  @Get(':id/status')
  @UseFilters(new AllExceptionsFilter(APIID.PAYMENT_STATUS))
  @ApiOperation({ summary: 'Get payment status' })
  @ApiOkResponse({
    description: 'Payment status retrieved successfully',
    type: PaymentStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Payment intent not found' })
  async getPaymentStatus(
    @Param('id', ParseUUIDPipe) paymentIntentId: string,
  ) {
    return await this.paymentService.getPaymentStatus(paymentIntentId);
  }
}

