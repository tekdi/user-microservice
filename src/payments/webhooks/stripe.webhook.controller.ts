import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from '../services/payment.service';
import { PaymentProvider as PaymentProviderEnum } from '../enums/payment.enums';

/**
 * Stripe Webhook Controller
 * Handles Stripe webhook events
 * Note: This endpoint should be excluded from authentication middleware
 */
@ApiTags('Payments')
@Controller('payments/webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private paymentService: PaymentService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature or data' })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any,
    @Headers('stripe-signature') signature: string,
  ) {
    // Get raw body for signature verification
    // When express.raw() middleware is used, body is a Buffer
    const rawBody = Buffer.isBuffer(body) ? body : (req.rawBody || Buffer.from(JSON.stringify(body)));
    
    // Parse body if it's a Buffer
    const parsedBody = Buffer.isBuffer(body) ? JSON.parse(body.toString('utf8')) : body;
    
    // Log webhook received with event details
    const eventType = parsedBody?.type || 'unknown';
    const eventId = parsedBody?.id || 'unknown';
    this.logger.log(`🔔 Stripe Webhook Received - Event Type: ${eventType}, Event ID: ${eventId}`);
    this.logger.debug(`Webhook payload: ${JSON.stringify(parsedBody, null, 2)}`);
    
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('Raw body not available, using JSON stringified body');
    }

    // Signature is optional in development mode (for testing without Stripe CLI)
    // In production, signature should always be present
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (!signature && nodeEnv === 'production') {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Use empty string if signature is missing (for development testing)
    const webhookSignature = signature || '';

    try {
      const result = await this.paymentService.handleWebhook(
        PaymentProviderEnum.STRIPE,
        parsedBody,
        rawBody,
        webhookSignature,
      );

      if (result.processed && 'paymentIntentId' in result) {
        this.logger.log(`✅ Stripe Webhook Processed Successfully - Payment Intent ID: ${result.paymentIntentId}`);
        return {
          received: true,
          processed: result.processed,
          paymentIntentId: result.paymentIntentId,
        };
      } else if ('reason' in result) {
        this.logger.log(`⚠️ Stripe Webhook Skipped - Reason: ${result.reason}`);
        return {
          received: true,
          processed: result.processed,
          reason: result.reason,
        };
      } else {
        // Fallback (should not happen)
        this.logger.warn('Stripe Webhook processed with unknown result format');
        return {
          received: true,
          processed: result.processed,
        };
      }
    } catch (error) {
      this.logger.error(`❌ Stripe Webhook Processing Failed - Error: ${error.message}`, error.stack);
      throw error;
    }
  }
}

