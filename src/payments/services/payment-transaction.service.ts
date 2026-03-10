import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../enums/payment.enums';

@Injectable()
export class PaymentTransactionService {
  constructor(
    @InjectRepository(PaymentTransaction)
    private paymentTransactionRepository: Repository<PaymentTransaction>,
  ) {}

  /**
   * Create a new payment transaction
   */
  async create(data: {
    paymentIntentId: string;
    provider: string;
    providerPaymentId?: string;
    providerSessionId?: string;
    status: PaymentTransactionStatus;
    failureReason?: string;
    rawResponse?: any;
  }): Promise<PaymentTransaction> {
    const transaction = this.paymentTransactionRepository.create({
      paymentIntentId: data.paymentIntentId,
      provider: data.provider as any,
      providerPaymentId: data.providerPaymentId || null,
      providerSessionId: data.providerSessionId || null,
      status: data.status,
      failureReason: data.failureReason || null,
      rawResponse: data.rawResponse || null,
    });

    return await this.paymentTransactionRepository.save(transaction);
  }

  /**
   * Find transaction by ID
   */
  async findById(id: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentTransactionRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  /**
   * Find transaction by provider payment ID
   */
  async findByProviderPaymentId(
    provider: string,
    paymentId: string,
  ): Promise<PaymentTransaction | null> {
    return await this.paymentTransactionRepository.findOne({
      where: {
        provider: provider as any,
        providerPaymentId: paymentId,
      },
    });
  }

  /**
   * Find transaction by provider session ID
   */
  async findByProviderSessionId(
    provider: string,
    sessionId: string,
  ): Promise<PaymentTransaction | null> {
    return await this.paymentTransactionRepository.findOne({
      where: {
        provider: provider as any,
        providerSessionId: sessionId,
      },
    });
  }

  /**
   * Find transaction for a payment intent that has no provider payment ID yet.
   * Used to attach webhook payload to the transaction created at initiation
   * (e.g. when Stripe did not return payment_intent at session create, or when
   * webhook event is payment_intent.succeeded and has no session ID).
   */
  async findOneByPaymentIntentIdWithNullProviderPaymentId(
    paymentIntentId: string,
    provider: string,
  ): Promise<PaymentTransaction | null> {
    return await this.paymentTransactionRepository.findOne({
      where: {
        paymentIntentId,
        provider: provider as any,
        providerPaymentId: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
  }
  async updateStatus(
    id: string,
    status: PaymentTransactionStatus,
    failureReason?: string,
  ): Promise<PaymentTransaction> {
    const transaction = await this.paymentTransactionRepository.findOne({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    transaction.status = status;
    if (failureReason) {
      transaction.failureReason = failureReason;
    }

    return await this.paymentTransactionRepository.save(transaction);
  }

  /**
   * Check if transaction exists (for idempotency)
   */
  async existsByProviderPaymentId(
    provider: string,
    paymentId: string,
  ): Promise<boolean> {
    const count = await this.paymentTransactionRepository.count({
      where: {
        provider: provider as any,
        providerPaymentId: paymentId,
      },
    });

    return count > 0;
  }
}

