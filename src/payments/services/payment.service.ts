import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentIntentService } from './payment-intent.service';
import { PaymentTransactionService } from './payment-transaction.service';
import { PaymentTargetService } from './payment-target.service';
import { CertificateService } from './certificate.service';
import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';
import {
  PaymentIntentStatus,
  PaymentTransactionStatus,
  PaymentTargetUnlockStatus,
  PaymentTargetType,
  PaymentProvider as PaymentProviderEnum,
} from '../enums/payment.enums';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentIntent } from '../entities/payment-intent.entity';
import { PaymentTarget } from '../entities/payment-target.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private paymentIntentService: PaymentIntentService,
    private paymentTransactionService: PaymentTransactionService,
    private paymentTargetService: PaymentTargetService,
    private certificateService: CertificateService,
    @Inject('PaymentProvider') private paymentProvider: PaymentProvider,
    @InjectDataSource() private dataSource: DataSource,
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
      currency: dto.currency || 'USD',
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
    const eventType = event?.type || 'unknown';
    const eventId = event?.id || 'unknown';
    this.logger.log(`📥 Processing webhook from ${provider} - Event: ${eventType} (${eventId})`);

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
      // Check if this is a duplicate event - compare mapped statuses
      const incomingStatus = this.mapWebhookStatusToTransactionStatus(webhookEvent.status);
      if (existingTransaction.status === incomingStatus) {
        this.logger.warn(
          `Duplicate webhook event for payment ${webhookEvent.paymentId} with status ${webhookEvent.status}, ignoring`,
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

    // Wrap all database operations in a transaction to ensure atomicity
    const result = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const transactionStatus = this.mapWebhookStatusToTransactionStatus(
          webhookEvent.status,
        );
        const intentStatus = this.mapWebhookStatusToIntentStatus(
          webhookEvent.status,
        );

        // Reload entities within transaction context to ensure we have the latest state
        const intentInTransaction = await manager.findOne(PaymentIntent, {
          where: { id: intent.id },
        });

        if (!intentInTransaction) {
          throw new BadRequestException(
            `Payment intent ${intent.id} not found in transaction`,
          );
        }

        // Reload existing transaction within transaction context if it exists
        let transactionToUpdate: PaymentTransaction | null = null;
        if (existingTransaction) {
          transactionToUpdate = await manager.findOne(PaymentTransaction, {
            where: { id: existingTransaction.id },
          });
        }

        // Update or create transaction
        let transaction: PaymentTransaction;

        if (!transactionToUpdate) {
          // Create new transaction
          const transactionEntity = manager.create(PaymentTransaction, {
            paymentIntentId: intentInTransaction.id,
            provider: provider as any,
            providerPaymentId: webhookEvent.paymentId,
            providerSessionId: webhookEvent.sessionId,
            status: transactionStatus,
            failureReason:
              webhookEvent.status === 'failed'
                ? 'Payment failed via webhook'
                : null,
            rawResponse: webhookEvent.rawEvent,
          });
          transaction = await manager.save(PaymentTransaction, transactionEntity);
        } else {
          // Update existing transaction
          transactionToUpdate.status = transactionStatus;
          if (webhookEvent.status === 'failed') {
            transactionToUpdate.failureReason = 'Payment failed via webhook';
          }
          transaction = await manager.save(
            PaymentTransaction,
            transactionToUpdate,
          );
        }

        // Update payment intent status
        intentInTransaction.status = intentStatus;
        await manager.save(PaymentIntent, intentInTransaction);

        // Unlock targets only on success
        if (webhookEvent.status === 'success') {
          await manager.update(
            PaymentTarget,
            {
              paymentIntentId: intentInTransaction.id,
              unlockStatus: PaymentTargetUnlockStatus.LOCKED,
            },
            {
              unlockStatus: PaymentTargetUnlockStatus.UNLOCKED,
              unlockedAt: new Date(),
            },
          );
          this.logger.log(
            `Unlocked targets for payment intent ${intentInTransaction.id}`,
          );
        }
        this.logger.log(`webhookEvent------------: ${JSON.stringify(webhookEvent)}`);

        return {
          processed: true,
          paymentIntentId: intentInTransaction.id,
          transactionId: transaction.id,
          status: webhookEvent.status,
          userId: intentInTransaction.userId,
          metadata: webhookEvent.metadata || {},
        };
      },
    );
    this.logger.log(`result------------: ${JSON.stringify(result)}`);

    // Process payment targets after successful payment (outside transaction to avoid blocking)
    if (result.processed && result.status === 'success' && result.userId) {
      this.processPaymentTargets(result.paymentIntentId, result.userId, result.metadata.contextId, result.metadata.purpose).catch(
        (error) => {
          // Log error but don't fail the webhook processing
          this.logger.error(
            `Failed to process payment targets for payment ${result.paymentIntentId}: ${error.message}`,
            error.stack,
          );
        },
      );
    }

    return result;
  }

  /**
   * Process payment targets after successful payment
   * Handles different target types (e.g., certificate generation for CERTIFICATE_BUNDLE)
   */
  private async processPaymentTargets(
    paymentIntentId: string,
    userId: string,
    contextId: string,
    purpose: string,
  ): Promise<void> {
    try {
      // Fetch payment targets to get contextId (courseId)
      const targets = await this.paymentTargetService.findByPaymentIntentId(
        paymentIntentId,
      );

      if (!targets || targets.length === 0) {
        this.logger.warn(
          `No targets found for payment intent ${paymentIntentId}`,
        );
        return;
      }

      // Process each target based on its type
      const targetPromises = targets.map(async (target) => {
        try {
          // Only generate certificate for CERTIFICATE_BUNDLE target type
          if (purpose === PaymentTargetType.CERTIFICATE_BUNDLE) {
            const issuanceDate = new Date().toISOString();
            const expirationDate = '0000-00-00T00:00:00.000Z'; // Default expiration date as per API

            await this.certificateService.generateCertificate({
              userId: userId,
              courseId: contextId, // contextId from target table is the courseId
              issuanceDate: issuanceDate,
              expirationDate: expirationDate,
            });

            this.logger.log(
              `Certificate generated for user ${userId} and course ${target.contextId}`,
            );
          } else {
            this.logger.debug(
              `Skipping certificate generation for target type: ${target.targetType}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process target ${target.id} for user ${userId}: ${error.message}`,
          );
          // Continue with other targets even if one fails
        }
      });

      await Promise.allSettled(targetPromises);
    } catch (error) {
      this.logger.error(
        `Error processing payment targets for payment ${paymentIntentId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
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

