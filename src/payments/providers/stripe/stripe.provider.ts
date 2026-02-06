import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentProvider, PaymentInitiationResult, PaymentWebhookEvent } from '../../interfaces/payment-provider.interface';
import { InitiatePaymentDto } from '../../dtos/initiate-payment.dto';
import { PaymentProvider as PaymentProviderEnum } from '../../enums/payment.enums';

/**
 * Stripe Payment Provider
 * Isolated Stripe SDK implementation
 */
@Injectable()
export class StripeProvider implements PaymentProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required in environment variables');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }

  getProviderName(): string {
    return PaymentProviderEnum.STRIPE;
  }

  async initiatePayment(paymentData: InitiatePaymentDto): Promise<PaymentInitiationResult> {
    try {
      const baseUrl = this.configService.get<string>('APP_BASE_URL', 'http://localhost:3000');
      const successUrl = `${baseUrl}/user/v1/payments/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/user/v1/payments/cancel`;

      // Create Stripe Checkout Session
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: paymentData.currency?.toLowerCase() || 'inr',
              product_data: {
                name: `Payment for ${paymentData.purpose}`,
                description: `Payment intent: ${paymentData.purpose}`,
              },
              unit_amount: Math.round(paymentData.amount * 100), // Convert to cents/paisa
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: paymentData.userId,
        metadata: {
          userId: paymentData.userId,
          purpose: paymentData.purpose,
          ...(paymentData.metadata || {}),
        },
      });

      this.logger.log(`Stripe checkout session created: ${session.id}`);

      return {
        checkoutUrl: session.url || '',
        sessionId: session.id,
        paymentId: session.payment_intent as string | undefined,
        metadata: {
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create Stripe checkout session: ${error.message}`, error.stack);
      throw new Error(`Stripe payment initiation failed: ${error.message}`);
    }
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    try {
      const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      
      if (!webhookSecret) {
        // In development, allow testing without webhook secret (with warning)
        if (nodeEnv === 'development' || nodeEnv === 'test') {
          this.logger.warn(
            '⚠️  STRIPE_WEBHOOK_SECRET not configured. ' +
            'Skipping signature verification (DEVELOPMENT MODE ONLY). ' +
            'For production, you MUST configure STRIPE_WEBHOOK_SECRET.'
          );
          return true; // Allow in development for testing
        } else {
          // In production, always require webhook secret
          this.logger.error('STRIPE_WEBHOOK_SECRET is required in production');
          return false;
        }
      }

      // Verify signature if secret is configured
      this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      return true;
    } catch (error) {
      this.logger.error(`Webhook signature verification failed: ${error.message}`);
      return false;
    }
  }

  parseWebhookEvent(payload: any): PaymentWebhookEvent {
    const event = payload as Stripe.Event;

    let paymentId: string = '';
    let sessionId: string = '';
    let status: 'success' | 'failed' | 'refunded' = 'failed';
    let amount = 0;
    let currency = 'inr';
    let metadata: Record<string, any> = {};

    // Handle different Stripe event types
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        sessionId = session.id;
        paymentId = session.payment_intent as string || '';
        status = session.payment_status === 'paid' ? 'success' : 'failed';
        amount = (session.amount_total || 0) / 100; // Convert from cents
        currency = session.currency || 'inr';
        metadata = session.metadata || {};
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        paymentId = paymentIntent.id;
        status = 'success';
        amount = paymentIntent.amount / 100;
        currency = paymentIntent.currency;
        metadata = paymentIntent.metadata || {};
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        paymentId = failedPayment.id;
        status = 'failed';
        amount = failedPayment.amount / 100;
        currency = failedPayment.currency;
        metadata = failedPayment.metadata || {};
        break;

      case 'charge.refunded':
        const refund = event.data.object as Stripe.Charge;
        paymentId = refund.payment_intent as string || '';
        status = 'refunded';
        amount = (refund.amount_refunded || 0) / 100;
        currency = refund.currency;
        metadata = refund.metadata || {};
        break;

      default:
        this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
        return {
          eventId: event.id,
          eventType: event.type,
          paymentId: '',
          status: 'failed',
          amount: 0,
          currency: 'inr',
          rawEvent: event,
        };
    }

    return {
      eventId: event.id,
      eventType: event.type,
      paymentId,
      sessionId,
      status,
      amount,
      currency,
      metadata,
      rawEvent: event,
    };
  }
}

