import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentIntent } from '../entities/payment-intent.entity';
import { PaymentIntentStatus } from '../enums/payment.enums';

@Injectable()
export class PaymentIntentService {
  constructor(
    @InjectRepository(PaymentIntent)
    private paymentIntentRepository: Repository<PaymentIntent>,
  ) {}

  /**
   * Create a new payment intent
   */
  async create(data: {
    userId: string;
    purpose: string;
    amount: number;
    currency: string;
    provider: string;
    metadata?: any;
  }): Promise<PaymentIntent> {
    const intent = this.paymentIntentRepository.create({
      userId: data.userId,
      purpose: data.purpose as any,
      amount: data.amount,
      currency: data.currency || 'USD',
      provider: data.provider as any,
      metadata: data.metadata || {},
      status: PaymentIntentStatus.CREATED,
    });

    return await this.paymentIntentRepository.save(intent);
  }

  /**
   * Find payment intent by ID with relations
   */
  async findById(id: string): Promise<PaymentIntent> {
    const intent = await this.paymentIntentRepository.findOne({
      where: { id },
      relations: ['transactions', 'targets'],
    });

    if (!intent) {
      throw new NotFoundException(`Payment intent with ID ${id} not found`);
    }

    return intent;
  }

  /**
   * Find payment intent by provider session ID
   */
  async findByProviderSessionId(
    provider: string,
    sessionId: string,
  ): Promise<PaymentIntent | null> {
    // Find through transaction
    const intent = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .leftJoinAndSelect('intent.transactions', 'transaction')
      .leftJoinAndSelect('intent.targets', 'target')
      .where('transaction.provider = :provider', { provider })
      .andWhere('transaction.providerSessionId = :sessionId', { sessionId })
      .getOne();

    return intent || null;
  }

  /**
   * Find payment intent by provider payment ID
   */
  async findByProviderPaymentId(
    provider: string,
    paymentId: string,
  ): Promise<PaymentIntent | null> {
    const intent = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .leftJoinAndSelect('intent.transactions', 'transaction')
      .leftJoinAndSelect('intent.targets', 'target')
      .where('transaction.provider = :provider', { provider })
      .andWhere('transaction.providerPaymentId = :paymentId', { paymentId })
      .getOne();

    return intent || null;
  }

  /**
   * Update payment intent status
   */
  async updateStatus(
    id: string,
    status: PaymentIntentStatus,
  ): Promise<PaymentIntent> {
    const intent = await this.findById(id);
    intent.status = status;
    return await this.paymentIntentRepository.save(intent);
  }

  /**
   * Check if payment intent exists (for idempotency)
   */
  async existsByProviderPaymentId(
    provider: string,
    paymentId: string,
  ): Promise<boolean> {
    const count = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .leftJoin('intent.transactions', 'transaction')
      .where('transaction.provider = :provider', { provider })
      .andWhere('transaction.providerPaymentId = :paymentId', { paymentId })
      .getCount();

    return count > 0;
  }
}
