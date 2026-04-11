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

  // Zero-decimal currencies (no decimal places)
  private readonly zeroDecimalCurrencies = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
  ]);

  // Three-decimal currencies
  private readonly threeDecimalCurrencies = new Set([
    'bhd', 'jod', 'kwd', 'omr', 'tnd',
  ]);

  constructor(private configService: ConfigService) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required in environment variables');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }

  /**
   * Get the currency exponent (multiplier) for Stripe unit_amount calculation
   * @param currency - Currency code (case-insensitive)
   * @returns The exponent: 0 for zero-decimal, 2 for two-decimal, 3 for three-decimal currencies
   */
  private getCurrencyExponent(currency: string): number {
    const normalizedCurrency = currency.toLowerCase();
    
    if (this.zeroDecimalCurrencies.has(normalizedCurrency)) {
      return 0;
    }
    
    if (this.threeDecimalCurrencies.has(normalizedCurrency)) {
      return 3;
    }
    
    // Default to 2 decimal places for most currencies
    return 2;
  }

  /**
   * Convert amount to Stripe's unit_amount (smallest currency unit)
   * @param amount - Amount in major currency units
   * @param currency - Currency code
   * @returns Amount in smallest currency unit
   */
  private convertToUnitAmount(amount: number, currency: string): number {
    const exponent = this.getCurrencyExponent(currency);
    const multiplier = Math.pow(10, exponent);
    return Math.round(amount * multiplier);
  }

  /**
   * Convert Stripe's unit_amount back to major currency units
   * @param unitAmount - Amount in smallest currency unit
   * @param currency - Currency code
   * @returns Amount in major currency units
   */
  private convertFromUnitAmount(unitAmount: number, currency: string): number {
    const exponent = this.getCurrencyExponent(currency);
    const divisor = Math.pow(10, exponent);
    return unitAmount / divisor;
  }

  getProviderName(): string {
    return PaymentProviderEnum.STRIPE;
  }

  /**
   * Checkout-created PaymentIntents often carry the session id in payment_details.order_reference.
   * Metadata may be empty on the PaymentIntent while our initiation row only has provider_session_id.
   */
  private checkoutSessionIdFromPaymentIntent(pi: Stripe.PaymentIntent): string {
    const ref = (
      pi as Stripe.PaymentIntent & {
        payment_details?: { order_reference?: string | null };
      }
    ).payment_details?.order_reference;
    return typeof ref === 'string' && ref.startsWith('cs_') ? ref : '';
  }

  /**
   * Create a Checkout Session. The charge is in the currency and amount provided so the customer
   * pays in their local currency and never sees or pays a conversion fee (merchant absorbs FX).
   */
  async initiatePayment(
    paymentData: InitiatePaymentDto,
    options?: { appPaymentIntentId?: string },
  ): Promise<PaymentInitiationResult> {
    try {
      // Use URLs from request body, fallback to environment variables or defaults
      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL'
      );
      // Ensure FRONTEND_URL ends with a slash
      const baseUrl = frontendUrl.endsWith('/') ? frontendUrl : `${frontendUrl}/`;
      
      const defaultSuccessUrl = this.configService.get<string>(
        'STRIPE_SUCCESS_URL',
        `${baseUrl}payment-success?session_id={CHECKOUT_SESSION_ID}`,
      );
      const defaultCancelUrl = this.configService.get<string>(
        'STRIPE_CANCEL_URL',
        `${baseUrl}payment-failed`,
      );

      // If successUrl is provided without the placeholder, append it
      // Stripe will replace {CHECKOUT_SESSION_ID} with the actual session ID when redirecting
      let successUrl = paymentData.successUrl || defaultSuccessUrl;
      if (paymentData.successUrl && !paymentData.successUrl.includes('{CHECKOUT_SESSION_ID}')) {
        // Append session_id parameter if not already present
        const separator = paymentData.successUrl.includes('?') ? '&' : '?';
        successUrl = `${paymentData.successUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;
      }

      const cancelUrl = paymentData.cancelUrl || defaultCancelUrl;

      // Prepare checkout session configuration
      // Charge in the customer's currency so they never see or pay a conversion fee (merchant absorbs FX)
      const currency = (paymentData.currency?.toLowerCase() || 'inr');
      const unitAmount = this.convertToUnitAmount(paymentData.amount, currency);
      
      const sessionConfig: Stripe.Checkout.SessionCreateParams & { adaptive_pricing?: { enabled: boolean } } = {
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Payment for ${paymentData.purpose}`,
                description: `Payment intent: ${paymentData.purpose}`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: paymentData.userId,
        // Disable Adaptive Pricing so the customer does not see "Choose a currency" or "includes X% conversion fee"
        adaptive_pricing: { enabled: false },
        metadata: {
          userId: paymentData.userId,
          purpose: paymentData.purpose,
          contextId: paymentData.targets[0].contextId,
          ...(paymentData.metadata || {}),
        },
        ...(options?.appPaymentIntentId
          ? {
              payment_intent_data: {
                metadata: {
                  appPaymentIntentId: options.appPaymentIntentId,
                },
              },
            }
          : {}),
      };

      // Support for promo codes and discounts
      if (paymentData.promoCode) {
        try {
          // Try to retrieve the promotion code first to get the associated coupon
          let couponId: string;
          
          try {
            // First, try to retrieve by promotion code ID
            const promotionCode = await this.stripe.promotionCodes.retrieve(paymentData.promoCode);
            couponId = promotionCode.coupon.id;
            this.logger.log(`Retrieved coupon ${couponId} from promotion code ${paymentData.promoCode}`);
          } catch (promoError) {
            // If promotion code retrieval fails, try to find by code
            this.logger.debug(
              `Promotion code ID retrieval failed: ${promoError instanceof Error ? promoError.message : String(promoError)}. Searching by code: ${paymentData.promoCode}`,
            );
            try {
              this.logger.log(`Promotion code ID retrieval failed, searching by code: ${paymentData.promoCode}`);
              const promotionCodes = await this.stripe.promotionCodes.list({
                code: paymentData.promoCode,
                active: true,
                limit: 1,
              });
              
              if (promotionCodes.data.length > 0) {
                couponId = promotionCodes.data[0].coupon.id;
                this.logger.log(`Found promotion code by code, using coupon ${couponId}`);
              } else {
                // If not found by code, try using it as a coupon ID directly
                this.logger.log(`Promotion code not found, trying as coupon ID: ${paymentData.promoCode}`);
                couponId = paymentData.promoCode;
              }
            } catch (listError) {
              // If listing fails, try using it as a coupon ID directly
              this.logger.warn(
                `Promotion code search failed: ${listError instanceof Error ? listError.message : String(listError)}. Trying as coupon ID: ${paymentData.promoCode}`,
              );
              couponId = paymentData.promoCode;
            }
          }

          // Apply the coupon
          sessionConfig.discounts = [
            {
              coupon: couponId,
            },
          ];
          this.logger.log(`Applying coupon: ${couponId}`);
        } catch (error) {
          this.logger.error(`Failed to apply promo code/coupon ${paymentData.promoCode}: ${error.message}`);
          throw new Error(`Invalid promo code or coupon: ${paymentData.promoCode}. ${error.message}`);
        }
      } else if (paymentData.allowPromotionCodes) {
        // Allow users to enter promo codes in the checkout UI
        sessionConfig.allow_promotion_codes = true;
        this.logger.log('Promo code entry enabled in checkout');
      }

      // Create Stripe Checkout Session
      const session = await this.stripe.checkout.sessions.create(sessionConfig);

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
        currency = session.currency || 'inr';
        amount = this.convertFromUnitAmount(session.amount_total || 0, currency);
        metadata = session.metadata || {};
        break;

      case 'checkout.session.expired': {
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        sessionId = expiredSession.id;
        paymentId = (expiredSession.payment_intent as string) || '';
        currency = expiredSession.currency || 'inr';
        amount = this.convertFromUnitAmount(
          expiredSession.amount_total || 0,
          currency,
        );
        metadata = expiredSession.metadata || {};
        break;
      }

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        paymentId = paymentIntent.id;
        sessionId = this.checkoutSessionIdFromPaymentIntent(paymentIntent);
        status = 'success';
        currency = paymentIntent.currency;
        amount = this.convertFromUnitAmount(paymentIntent.amount, currency);
        metadata = paymentIntent.metadata || {};
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        paymentId = failedPayment.id;
        sessionId = this.checkoutSessionIdFromPaymentIntent(failedPayment);
        currency = failedPayment.currency;
        amount = this.convertFromUnitAmount(failedPayment.amount, currency);
        metadata = failedPayment.metadata || {};
        break;

      case 'charge.refunded':
        const refund = event.data.object as Stripe.Charge;
        paymentId = refund.payment_intent as string || '';
        status = 'refunded';
        currency = refund.currency;
        amount = this.convertFromUnitAmount(refund.amount_refunded || 0, currency);
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

