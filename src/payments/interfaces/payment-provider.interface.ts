import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';

/**
 * Result of initiating a payment
 */
export interface PaymentInitiationResult {
  checkoutUrl: string;
  sessionId: string;
  paymentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Webhook event data from payment provider
 */
export interface PaymentWebhookEvent {
  eventId: string;
  eventType: string;
  paymentId: string;
  sessionId?: string;
  status: 'success' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
  rawEvent: any;
}

/**
 * Payment Provider Interface
 * All payment providers must implement this interface
 */
export interface PaymentProvider {
  /**
   * Initialize a payment session
   * @param paymentData Payment initiation data
   * @returns Checkout URL and session details
   */
  initiatePayment(paymentData: InitiatePaymentDto): Promise<PaymentInitiationResult>;

  /**
   * Verify webhook signature
   * @param payload Raw webhook payload
   * @param signature Signature from headers
   * @returns true if signature is valid
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean;

  /**
   * Parse webhook event
   * @param payload Raw webhook payload
   * @returns Parsed webhook event
   */
  parseWebhookEvent(payload: any): PaymentWebhookEvent;

  /**
   * Get provider name
   */
  getProviderName(): string;
}

