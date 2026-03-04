import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, In } from 'typeorm';
import { PaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentIntentService } from './payment-intent.service';
import { PaymentTransactionService } from './payment-transaction.service';
import { PaymentTargetService } from './payment-target.service';
import { CertificateService } from './certificate.service';
import { CouponService } from './coupon.service';
import { InitiatePaymentDto } from '../dtos/initiate-payment.dto';
import {
  PaymentIntentStatus,
  PaymentTransactionStatus,
  PaymentTargetUnlockStatus,
  PaymentPurpose,
  PaymentProvider as PaymentProviderEnum,
} from '../enums/payment.enums';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentIntent } from '../entities/payment-intent.entity';
import { PaymentTarget } from '../entities/payment-target.entity';
import { User } from '../../user/entities/user-entity';
import { PaymentReportItemDto } from '../dtos/payment-report.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly paymentIntentService: PaymentIntentService,
    private readonly paymentTransactionService: PaymentTransactionService,
    private readonly paymentTargetService: PaymentTargetService,
    private readonly certificateService: CertificateService,
    private readonly couponService: CouponService,
    @Inject('PaymentProvider') private readonly paymentProvider: PaymentProvider,
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Initiate a payment
   * Creates payment intent, targets, and checkout session
   */
  async initiatePayment(dto: InitiatePaymentDto) {
    this.logger.log(`Initiating payment for user ${dto.userId}`);

    // Validate coupon if provided
    let validatedCoupon = null;
    let finalAmount = dto.amount;
    let stripePromoCodeId: string | undefined = undefined;
    
    if (dto.promoCode) {
      const target = dto.targets[0]; // Get first target for context validation
      const validationResult = await this.couponService.validateCoupon({
        couponCode: dto.promoCode,
        userId: dto.userId,
        contextType: target.contextType,
        contextId: target.contextId,
        originalAmount: dto.amount,
        countryId: dto.metadata?.countryId,
      });

      if (!validationResult.isValid) {
        throw new BadRequestException(
          validationResult.error || 'Invalid coupon code',
        );
      }

      validatedCoupon = validationResult.coupon;
      // Use nullish coalescing to handle 100% discounts (discountedAmount = 0)
      // Only fall back to original amount if discountedAmount is undefined/null
      finalAmount = validationResult.discountedAmount ?? dto.amount;
      
      // Get the full coupon to access stripePromoCodeId
      const fullCoupon = await this.couponService.getCouponById(validatedCoupon.id);
      
      if (fullCoupon === null) {
        throw new BadRequestException(
          `Coupon ${dto.promoCode} not found in database after validation`,
        );
      }

        // If coupon doesn't have Stripe promo code ID, sync it first
        if (!fullCoupon.stripePromoCodeId) {
          this.logger.log(`Coupon ${dto.promoCode} not synced to Stripe, syncing now...`);
          try {
            await this.couponService.syncCouponToStripe(fullCoupon);
            // Reload to get the updated stripePromoCodeId
            const updatedCoupon = await this.couponService.getCouponById(validatedCoupon.id);
          if (!updatedCoupon?.stripePromoCodeId) {
            throw new BadRequestException(
              `Failed to sync coupon ${dto.promoCode} to Stripe. Stripe promotion code ID not available.`,
            );
          }
              stripePromoCodeId = updatedCoupon.stripePromoCodeId;
          } catch (error) {
            this.logger.error(
              `Failed to sync coupon ${dto.promoCode} to Stripe: ${error.message}`,
            );
          if (error instanceof BadRequestException) {
            throw error;
          }
            throw new BadRequestException(
              `Coupon ${dto.promoCode} is not available in Stripe. Please sync it first.`,
            );
          }
        } else {
          stripePromoCodeId = fullCoupon.stripePromoCodeId;
        }
      
      // Ensure we have a valid Stripe promotion code ID before proceeding
      if (!stripePromoCodeId) {
        throw new BadRequestException(
          `Stripe promotion code ID is required for coupon ${dto.promoCode}. Please sync the coupon to Stripe first.`,
        );
      }
      
      this.logger.log(
        `Coupon ${dto.promoCode} validated. Original: ${dto.amount}, Discounted: ${finalAmount}, Stripe Promo Code ID: ${stripePromoCodeId}`,
      );
    }

    // Create payment intent with final amount (after discount)
    const intent = await this.paymentIntentService.create({
      userId: dto.userId,
      purpose: dto.purpose,
      amount: finalAmount,
      currency: dto.currency || 'USD',
      provider: PaymentProviderEnum.STRIPE, // Default to Stripe for now
      metadata: {
        ...dto.metadata,
        originalAmount: dto.amount,
        couponCode: validatedCoupon?.couponCode,
        couponId: validatedCoupon?.id,
      },
    });

    // Create payment targets (locked)
    await this.paymentTargetService.createMany(intent.id, dto.targets);

    // Initiate payment with provider (pass original amount for Stripe, it will apply discount)
    // Stripe requires a promotion code ID, not a human-readable coupon code
    const providerResult = await this.paymentProvider.initiatePayment({
      ...dto,
      amount: dto.amount, // Pass original amount, Stripe will apply discount via promo code
      promoCode: stripePromoCodeId, // Must be a Stripe promotion code ID (e.g., "promo_xxx")
    });

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
      ...(validatedCoupon && {
        coupon: {
          code: validatedCoupon.couponCode,
          discountAmount: dto.amount - finalAmount,
          finalAmount,
        },
      }),
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

        return {
          processed: true,
          paymentIntentId: intentInTransaction.id,
          transactionId: transaction.id,
          status: webhookEvent.status,
          userId: intentInTransaction.userId,
          metadata: webhookEvent.metadata || {},
          couponId: intentInTransaction.metadata?.couponId,
        };
      },
    );

    // Process payment targets after successful payment (outside transaction to avoid blocking)
    if (result.processed && result.status === 'success' && result.userId) {
      // Record coupon redemption if coupon was used
      if (result.couponId) {
        this.couponService.recordRedemption(
          result.couponId,
          result.userId,
          result.paymentIntentId,
        ).catch((error) => {
          // Log error but don't fail the webhook processing
          this.logger.error(
            `Failed to record coupon redemption for payment ${result.paymentIntentId}: ${error.message}`,
            error.stack,
          );
        });
      }

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
   * Uses metadata from webhook instead of fetching from database
   */
  private async processPaymentTargets(
    paymentIntentId: string,
    userId: string,
    contextId: string,
    purpose: string,
  ): Promise<void> {
    try {
      // Only generate certificate for CERTIFICATE_BUNDLE purpose
      if (purpose === PaymentPurpose.CERTIFICATE_BUNDLE) {
        const issuanceDate = new Date().toISOString();
        const expirationDate = '0000-00-00T00:00:00.000Z'; // Default expiration date as per API

        await this.certificateService.generateCertificate({
          userId: userId,
          courseId: contextId, // contextId from webhook metadata
          issuanceDate: issuanceDate,
          expirationDate: expirationDate,
        });

        this.logger.log(
          `Certificate generated for user ${userId} and course ${contextId}`,
        );
      } else {
        this.logger.debug(
          `Skipping certificate generation for purpose: ${purpose}`,
        );
      }
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
      statusReason: intent.statusReason ?? null,
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
   * Get payment report by contextId with pagination
   * Returns payment transactions with user details, amounts, discounts, and status
   * Pagination is applied to transactions, not targets, to ensure accurate item count
   * Optional search filters by firstName, lastName, or email (case-insensitive).
   */
  async getPaymentReportByContextId(
    contextId: string,
    limit: number = 50,
    offset: number = 0,
    search?: string,
  ): Promise<{ data: PaymentReportItemDto[]; totalCount: number }> {
    const searchTerm =
      typeof search === 'string' && search.trim().length > 0
        ? search.trim().toLowerCase()
        : undefined;
    const searchLog = searchTerm ? `, search: ${searchTerm}` : '';
    
    const countQb = this.dataSource
      .getRepository(PaymentTransaction)
      .createQueryBuilder('transaction')
      .innerJoin('transaction.paymentIntent', 'intent')
      .innerJoin('intent.targets', 'target')
      .where('target.contextId = :contextId', { contextId });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      countQb
        .innerJoin(User, 'user', 'user.userId = intent.userId')
        .andWhere(
          '(LOWER(COALESCE(user.firstName, \'\')) LIKE :searchPattern OR LOWER(COALESCE(user.lastName, \'\')) LIKE :searchPattern OR LOWER(COALESCE(user.email, \'\')) LIKE :searchPattern)',
          { searchPattern },
        );
    }

    const totalCount = await countQb.getCount();

    if (totalCount === 0) {
      this.logger.warn(`No payment transactions found for contextId: ${contextId}`);
      return {
        data: [],
        totalCount: 0,
      };
    }

    // Query transactions directly with pagination
    const dataQb = this.dataSource
      .getRepository(PaymentTransaction)
      .createQueryBuilder('transaction')
      .innerJoinAndSelect('transaction.paymentIntent', 'intent')
      .innerJoin('intent.targets', 'target')
      .where('target.contextId = :contextId', { contextId })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      dataQb
        .innerJoin(User, 'user', 'user.userId = intent.userId')
        .andWhere(
          '(LOWER(COALESCE(user.firstName, \'\')) LIKE :searchPattern OR LOWER(COALESCE(user.lastName, \'\')) LIKE :searchPattern OR LOWER(COALESCE(user.email, \'\')) LIKE :searchPattern)',
          { searchPattern },
        );
    }

    const transactions = await dataQb.getMany();

    // If no transactions found for this page (e.g., offset beyond available data),
    // return empty data but preserve the actual totalCount for correct pagination
    if (transactions.length === 0) {
      return {
        data: [],
        totalCount, // Use computed totalCount, not 0, so callers know the actual record count
      };
    }

    // Extract all unique user IDs and payment intents
    const userIds = new Set<string>();
    interface ReportItemWithUserId extends PaymentReportItemDto {
      _userId?: string; // Temporary field for mapping
    }
    const reportItems: ReportItemWithUserId[] = [];

    transactions.forEach((transaction) => {
      if (transaction.paymentIntent) {
        userIds.add(transaction.paymentIntent.userId);

        const originalAmount = transaction.paymentIntent.metadata?.originalAmount
          ? Number(transaction.paymentIntent.metadata.originalAmount)
          : Number(transaction.paymentIntent.amount);
        const paidAmount = Number(transaction.paymentIntent.amount);
        const discountCode = transaction.paymentIntent.metadata?.couponCode || null;
        const discountAmount =
          discountCode === null ? null : originalAmount - paidAmount;

        reportItems.push({
          firstName: null, // Will be filled after fetching users
          lastName: null, // Will be filled after fetching users
          email: null, // Will be filled after fetching users
          actualAmount: originalAmount,
          paidAmount: paidAmount,
          discountApplied: discountCode,
          discountAmount: discountAmount,
          transactionId: transaction.id,
          transactionTime: transaction.createdAt,
          status: this.mapTransactionStatusToReportStatus(transaction.status),
          _userId: transaction.paymentIntent.userId, // Temporary field for mapping
        });
      }
    });

    // Fetch users separately using In operator for efficient querying
    if (userIds.size > 0) {
      const users = await this.userRepository.find({
        where: { userId: In(Array.from(userIds)) },
        select: ['userId', 'firstName', 'lastName', 'email'],
      });

      const userMap = new Map(users.map((u) => [u.userId, u]));

      // Map user data to report items
      reportItems.forEach((item) => {
        const user = item._userId ? userMap.get(item._userId) : null;
        if (user) {
          item.firstName = user.firstName || null;
          item.lastName = user.lastName || null;
          item.email = user.email || null;
        } else {
          item.firstName = null;
          item.lastName = null;
          item.email = null;
        }
        delete item._userId; // Remove temporary field
      });
    } else {
      // If no users found, values remain null
      reportItems.forEach((item) => {
        delete item._userId;
      });
    }

    return {
      data: reportItems as PaymentReportItemDto[],
      totalCount,
    };
  }

  /**
   * Map transaction status to report status format
   */
  private mapTransactionStatusToReportStatus(
    status: PaymentTransactionStatus,
  ): string {
    switch (status) {
      case PaymentTransactionStatus.SUCCESS:
        return 'PAID';
      case PaymentTransactionStatus.FAILED:
        return 'FAILED';
      case PaymentTransactionStatus.INITIATED:
        return 'PENDING';
      case PaymentTransactionStatus.REFUNDED:
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
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

  /**
   * Map payment intent status to transaction status (for manual override)
   */
  private mapIntentStatusToTransactionStatus(
    status: PaymentIntentStatus,
  ): PaymentTransactionStatus {
    switch (status) {
      case PaymentIntentStatus.CREATED:
        return PaymentTransactionStatus.INITIATED;
      case PaymentIntentStatus.PAID:
        return PaymentTransactionStatus.SUCCESS;
      case PaymentIntentStatus.FAILED:
        return PaymentTransactionStatus.FAILED;
      case PaymentIntentStatus.REFUNDED:
        return PaymentTransactionStatus.REFUNDED;
      default:
        return PaymentTransactionStatus.INITIATED;
    }
  }

  /**
   * Manually override payment status (admin/support use).
   * Updates payment intent status and status_reason, all related transactions, and optionally unlocks targets when set to PAID.
   */
  async overridePaymentStatus(
    paymentIntentId: string,
    status: PaymentIntentStatus,
    reason: string,
  ) {
    const intent = await this.paymentIntentService.findById(paymentIntentId);
    const transactionStatus =
      this.mapIntentStatusToTransactionStatus(status);

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const intentInTx = await manager.findOne(PaymentIntent, {
        where: { id: intent.id },
        relations: ['transactions', 'targets'],
      });

      if (!intentInTx) {
        throw new BadRequestException(
          `Payment intent ${paymentIntentId} not found`,
        );
      }

      intentInTx.status = status;
      intentInTx.statusReason = reason;
      await manager.save(PaymentIntent, intentInTx);

      for (const tx of intentInTx.transactions) {
        tx.status = transactionStatus;
        if (status === PaymentIntentStatus.FAILED && !tx.failureReason) {
          tx.failureReason = 'Status manually overridden';
        }
        await manager.save(PaymentTransaction, tx);
      }

      if (status === PaymentIntentStatus.PAID) {
        await manager.update(
          PaymentTarget,
          {
            paymentIntentId: intentInTx.id,
            unlockStatus: PaymentTargetUnlockStatus.LOCKED,
          },
          {
            unlockStatus: PaymentTargetUnlockStatus.UNLOCKED,
            unlockedAt: new Date(),
          },
        );
        this.logger.log(
          `Manual override: unlocked targets for payment intent ${intentInTx.id}`,
        );
      }
    });

    if (status === PaymentIntentStatus.PAID && intent.userId) {
      const purpose = intent.purpose;
      // Run after-payment success steps: certificate generation per target (same as webhook flow)
      if (purpose === PaymentPurpose.CERTIFICATE_BUNDLE && intent.targets?.length) {
        for (const target of intent.targets) {
          this.processPaymentTargets(
            paymentIntentId,
            intent.userId,
            target.contextId,
            purpose,
          ).catch((error) => {
            this.logger.error(
              `Failed to process payment target (certificate) after manual override for ${paymentIntentId}, contextId ${target.contextId}: ${error.message}`,
              error.stack,
            );
          });
        }
      } else if (purpose && intent.metadata?.contextId) {
        // Fallback: single context from metadata (e.g. when targets not loaded or legacy)
        this.processPaymentTargets(
          paymentIntentId,
          intent.userId,
          intent.metadata.contextId,
          purpose,
        ).catch((error) => {
          this.logger.error(
            `Failed to process payment targets after manual override for ${paymentIntentId}: ${error.message}`,
            error.stack,
          );
        });
      }
      if (intent.metadata?.couponId) {
        this.couponService
          .recordRedemption(
            intent.metadata.couponId,
            intent.userId,
            paymentIntentId,
          )
          .catch((error) => {
            this.logger.error(
              `Failed to record coupon redemption after manual override for ${paymentIntentId}: ${error.message}`,
              error.stack,
            );
          });
      }
    }

    return this.getPaymentStatus(paymentIntentId);
  }

  /**
   * Manually override payment status by transaction ID (admin/support use).
   * Resolves the payment intent from the transaction and performs the same override as overridePaymentStatus.
   */
  async overridePaymentStatusByTransactionId(
    transactionId: string,
    status: PaymentIntentStatus,
    reason: string,
  ) {
    const transaction =
      await this.paymentTransactionService.findById(transactionId);
    return this.overridePaymentStatus(
      transaction.paymentIntentId,
      status,
      reason,
    );
  }
}

