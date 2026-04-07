import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
   * Find payment intent by provider session ID.
   * Uses getMany() + explicit handling so duplicate (provider, providerSessionId) rows
   * result in a clear ConflictException instead of arbitrary getOne() result.
   */
  async findByProviderSessionId(
    provider: string,
    sessionId: string,
  ): Promise<PaymentIntent | null> {
    const intents = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .leftJoinAndSelect('intent.transactions', 'transaction')
      .leftJoinAndSelect('intent.targets', 'target')
      .where('transaction.provider = :provider', { provider })
      .andWhere('transaction.providerSessionId = :sessionId', { sessionId })
      .getMany();

    if (intents.length === 0) {
      return null;
    }
    if (intents.length > 1) {
      throw new ConflictException(
        `Multiple payment intents found for session_id ${sessionId}. Please contact support.`,
      );
    }
    return intents[0];
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
   * All payment intents for this user that have a target with the given contextId.
   * Ordered by intent updatedAt descending (newest first).
   */
  /**
   * Latest PAID intent for this user with a target for the given contextId, if any.
   */
  async findPaidByUserIdAndContextId(
    userId: string,
    contextId: string,
  ): Promise<Pick<PaymentIntent, 'id'> | null> {
    const row = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .select('intent.id', 'id')
      .innerJoin('intent.targets', 't')
      .where('intent.userId = :userId', { userId })
      .andWhere('t.contextId = :contextId', { contextId })
      .andWhere('intent.status = :status', { status: PaymentIntentStatus.PAID })
      .groupBy('intent.id')
      .orderBy('MAX(intent.updatedAt)', 'DESC')
      .addOrderBy('intent.id', 'DESC')
      .limit(1)
      .getRawOne();

    const id = row?.id as string | undefined;
    return id ? { id } : null;
  }

  async findAllByUserIdAndContextId(
    userId: string,
    contextId: string,
  ): Promise<PaymentIntent[]> {
    const rows = await this.paymentIntentRepository
      .createQueryBuilder('intent')
      .select('intent.id', 'id')
      .innerJoin('intent.targets', 't')
      .where('intent.userId = :userId', { userId })
      .andWhere('t.contextId = :contextId', { contextId })
      .groupBy('intent.id')
      .orderBy('MAX(intent.updatedAt)', 'DESC')
      .addOrderBy('intent.id', 'DESC')
      .getRawMany();

    const ids = rows.map((r) => r.id as string).filter(Boolean);
    if (ids.length === 0) {
      return [];
    }

    const intents = await this.paymentIntentRepository.find({
      where: { id: In(ids) },
      relations: ['transactions', 'targets'],
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    intents.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return intents;
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
