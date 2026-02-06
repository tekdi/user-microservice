import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTarget } from '../entities/payment-target.entity';
import { PaymentTargetUnlockStatus } from '../enums/payment.enums';

@Injectable()
export class PaymentTargetService {
  constructor(
    @InjectRepository(PaymentTarget)
    private paymentTargetRepository: Repository<PaymentTarget>,
  ) {}

  /**
   * Create payment targets (entitlements to unlock)
   */
  async createMany(
    paymentIntentId: string,
    targets: Array<{
      targetType: string;
      targetId: string;
      contextType: string;
      contextId: string;
    }>,
  ): Promise<PaymentTarget[]> {
    const targetEntities = targets.map((target) =>
      this.paymentTargetRepository.create({
        paymentIntentId,
        targetType: target.targetType as any,
        targetId: target.targetId,
        contextType: target.contextType as any,
        contextId: target.contextId,
        unlockStatus: PaymentTargetUnlockStatus.LOCKED,
      }),
    );

    return await this.paymentTargetRepository.save(targetEntities);
  }

  /**
   * Unlock all targets for a payment intent
   */
  async unlockAll(paymentIntentId: string): Promise<void> {
    await this.paymentTargetRepository.update(
      {
        paymentIntentId,
        unlockStatus: PaymentTargetUnlockStatus.LOCKED,
      },
      {
        unlockStatus: PaymentTargetUnlockStatus.UNLOCKED,
        unlockedAt: new Date(),
      },
    );
  }

  /**
   * Get all targets for a payment intent
   */
  async findByPaymentIntentId(paymentIntentId: string): Promise<PaymentTarget[]> {
    return await this.paymentTargetRepository.find({
      where: { paymentIntentId },
    });
  }
}

