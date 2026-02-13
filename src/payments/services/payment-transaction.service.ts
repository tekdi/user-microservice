import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * Update transaction status
   */
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

