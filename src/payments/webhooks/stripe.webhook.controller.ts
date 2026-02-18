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

  constructor(private readonly paymentService: PaymentService) {}

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
    try {
      // Get raw body for signature verification
      // When express.raw() middleware is used, body is a Buffer
      let rawBody: Buffer;
      let parsedBody: any;

      if (Buffer.isBuffer(body)) {
        rawBody = body;
        // Safely parse JSON from Buffer
        try {
          parsedBody = JSON.parse(body.toString('utf8'));
        } catch (parseError) {
          this.logger.error(`Failed to parse webhook body as JSON: ${parseError.message}`);
          throw new BadRequestException('Invalid JSON payload in webhook body');
        }
      } else {
        // If body is already parsed, try to get raw body from request
        rawBody = req.rawBody || (() => {
          try {
            return Buffer.from(JSON.stringify(body));
          } catch (stringifyError) {
            this.logger.error(`Failed to stringify webhook body: ${stringifyError.message}`);
            throw new BadRequestException('Invalid webhook body format');
          }
        })();
        parsedBody = body;
      }
      
      // Validate parsed body structure
      if (!parsedBody || typeof parsedBody !== 'object') {
        this.logger.error('Webhook body is not a valid object');
        throw new BadRequestException('Invalid webhook payload structure');
      }
      
      // Log webhook received with event details
      const eventType = parsedBody?.type || 'unknown';
      const eventId = parsedBody?.id || 'unknown';
      this.logger.log(`🔔 Stripe Webhook Received - Event Type: ${eventType}, Event ID: ${eventId}`);
      
      if (!rawBody || rawBody.length === 0) {
        this.logger.warn('Raw body not available, using JSON stringified body');
      }

      // Try to get signature from headers (case-insensitive fallback)
      // NestJS @Headers decorator is case-sensitive, so we also check the request directly
      let webhookSignature = signature;
      if (!webhookSignature) {
        // Try to find the header in the request (case-insensitive)
        const headerKeys = Object.keys(req.headers);
        const stripeSignatureKey = headerKeys.find(
          key => key.toLowerCase() === 'stripe-signature'
        );
        
        if (stripeSignatureKey) {
          webhookSignature = req.headers[stripeSignatureKey] as string;
        }
      }

      if (!webhookSignature) {
        this.logger.warn('⚠️ stripe-signature header is missing');
      }

      // Signature is optional in development mode (for testing without Stripe CLI)
      // In production, signature should always be present
      const nodeEnv = process.env.NODE_ENV || 'development';
      if (!webhookSignature && nodeEnv === 'production') {
        throw new BadRequestException('Missing stripe-signature header');
      }

      // Use empty string if signature is missing (for development testing)
      webhookSignature = webhookSignature || '';
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
      // If it's already a BadRequestException, re-throw it
      if (error instanceof BadRequestException) {
        this.logger.error(`❌ Stripe Webhook Validation Failed - Error: ${error.message}`);
        throw error;
      }
      
      // For other errors, log and throw as BadRequestException to avoid exposing internal errors
      this.logger.error(`❌ Stripe Webhook Processing Failed - Error: ${error.message}`, error.stack);
      throw new BadRequestException(`Webhook processing failed: ${error.message}`);
    }
  }
}

