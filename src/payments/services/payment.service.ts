import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentIntentService } from './payment-intent.service';
import { PaymentTransactionService } from './payment-transaction.service';
import { PaymentTargetService } from './payment-target.service';
import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';
import {
  PaymentIntentStatus,
  PaymentTransactionStatus,
} from '../enums/payment.enums';
import { PaymentProvider as PaymentProviderEnum } from '../enums/payment.enums';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private paymentIntentService: PaymentIntentService,
    private paymentTransactionService: PaymentTransactionService,
    private paymentTargetService: PaymentTargetService,
    @Inject('PaymentProvider') private paymentProvider: PaymentProvider,
  ) {}

  /**
   * Initiate a payment
   * Creates payment intent, targets, and checkout session
   */
  async initiatePayment(dto: InitiatePaymentDto) {
    this.logger.log(`Initiating payment for user ${dto.userId}`);

    // Create payment intent
    const intent = await this.paymentIntentService.create({
      userId: dto.userId,
      purpose: dto.purpose,
      amount: dto.amount,
      currency: dto.currency || 'INR',
      provider: PaymentProviderEnum.STRIPE, // Default to Stripe for now
      metadata: dto.metadata || {},
    });

    // Create payment targets (locked)
    await this.paymentTargetService.createMany(intent.id, dto.targets);

    // Initiate payment with provider
    const providerResult = await this.paymentProvider.initiatePayment(dto);

    // Create initial transaction
    await this.paymentTransactionService.create({
      paymentIntentId: intent.id,
      provider: PaymentProviderEnum.STRIPE,
      providerPaymentId: providerResult.paymentId || undefined,
      providerSessionId: providerResult.sessionId,
      status: PaymentTransactionStatus.INITIATED,
      rawResponse: providerResult.metadata,
    });

    return {
      paymentIntentId: intent.id,
      checkoutUrl: providerResult.checkoutUrl,
      sessionId: providerResult.sessionId,
    };
  }

  /**
   * Handle webhook event
   * Updates payment status and unlocks targets on success
   */
  async handleWebhook(
    provider: string,
    event: any,
    rawPayload: string | Buffer,
    signature: string,
  ) {
    this.logger.log(`Handling webhook from ${provider}`);

    // Verify signature (optional in development mode)
    const isValid = this.paymentProvider.verifyWebhookSignature(
      rawPayload,
      signature,
    );

    if (!isValid) {
      this.logger.error('Webhook signature verification failed');
      throw new BadRequestException('Invalid webhook signature');
    }

    // Parse webhook event
    const webhookEvent = this.paymentProvider.parseWebhookEvent(event);

    // Check idempotency - ensure we haven't processed this event
    const existingTransaction = await this.paymentTransactionService.findByProviderPaymentId(
      provider,
      webhookEvent.paymentId,
    );

    if (existingTransaction) {
      // Check if this is a duplicate event
      if (existingTransaction.status === PaymentTransactionStatus.SUCCESS && 
          webhookEvent.status === 'success') {
        this.logger.warn(
          `Duplicate webhook event for payment ${webhookEvent.paymentId}, ignoring`,
        );
        return { processed: false, reason: 'duplicate' };
      }
    }

    // Find payment intent by provider payment ID or session ID
    let intent = await this.paymentIntentService.findByProviderPaymentId(
      provider,
      webhookEvent.paymentId,
    );

    if (!intent && webhookEvent.sessionId) {
      intent = await this.paymentIntentService.findByProviderSessionId(
        provider,
        webhookEvent.sessionId,
      );
    }

    if (!intent) {
      this.logger.error(
        `Payment intent not found for payment ${webhookEvent.paymentId}`,
      );
      throw new BadRequestException('Payment intent not found');
    }

    // Update or create transaction
    let transaction = existingTransaction;
    
    if (!transaction) {
      // Create new transaction
      transaction = await this.paymentTransactionService.create({
        paymentIntentId: intent.id,
        provider: provider as any,
        providerPaymentId: webhookEvent.paymentId,
        providerSessionId: webhookEvent.sessionId,
        status: this.mapWebhookStatusToTransactionStatus(webhookEvent.status),
        failureReason:
          webhookEvent.status === 'failed'
            ? 'Payment failed via webhook'
            : undefined,
        rawResponse: webhookEvent.rawEvent,
      });
    } else {
      // Update existing transaction
      transaction = await this.paymentTransactionService.updateStatus(
        transaction.id,
        this.mapWebhookStatusToTransactionStatus(webhookEvent.status),
        webhookEvent.status === 'failed' ? 'Payment failed via webhook' : undefined,
      );
    }

    // Update payment intent status
    const intentStatus = this.mapWebhookStatusToIntentStatus(webhookEvent.status);
    await this.paymentIntentService.updateStatus(intent.id, intentStatus);

    // Unlock targets only on success
    if (webhookEvent.status === 'success') {
      await this.paymentTargetService.unlockAll(intent.id);
      this.logger.log(`Unlocked targets for payment intent ${intent.id}`);
    }

    return {
      processed: true,
      paymentIntentId: intent.id,
      transactionId: transaction.id,
      status: webhookEvent.status,
    };
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentIntentId: string) {
    const intent = await this.paymentIntentService.findById(paymentIntentId);
    
    return {
      id: intent.id,
      userId: intent.userId,
      purpose: intent.purpose,
      amount: Number(intent.amount),
      currency: intent.currency,
      status: intent.status,
      provider: intent.provider,
      metadata: intent.metadata,
      transactions: intent.transactions.map((t) => ({
        id: t.id,
        provider: t.provider,
        providerPaymentId: t.providerPaymentId,
        status: t.status,
        failureReason: t.failureReason,
        createdAt: t.createdAt,
      })),
      targets: intent.targets.map((t) => ({
        id: t.id,
        targetType: t.targetType,
        targetId: t.targetId,
        contextType: t.contextType,
        contextId: t.contextId,
        unlockStatus: t.unlockStatus,
        unlockedAt: t.unlockedAt,
      })),
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
  }

  /**
   * Map webhook status to transaction status
   */
  private mapWebhookStatusToTransactionStatus(
    status: 'success' | 'failed' | 'refunded',
  ): PaymentTransactionStatus {
    switch (status) {
      case 'success':
        return PaymentTransactionStatus.SUCCESS;
      case 'failed':
        return PaymentTransactionStatus.FAILED;
      case 'refunded':
        return PaymentTransactionStatus.REFUNDED;
      default:
        return PaymentTransactionStatus.FAILED;
    }
  }

  /**
   * Map webhook status to intent status
   */
  private mapWebhookStatusToIntentStatus(
    status: 'success' | 'failed' | 'refunded',
  ): PaymentIntentStatus {
    switch (status) {
      case 'success':
        return PaymentIntentStatus.PAID;
      case 'failed':
        return PaymentIntentStatus.FAILED;
      case 'refunded':
        return PaymentIntentStatus.REFUNDED;
      default:
        return PaymentIntentStatus.FAILED;
    }
  }
}

