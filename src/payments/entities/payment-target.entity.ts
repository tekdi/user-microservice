import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  PaymentTargetType,
  PaymentContextType,
  PaymentTargetUnlockStatus,
} from '../enums/payment.enums';
import { PaymentIntent } from './payment-intent.entity';

/**
 * Payment Target Entity
 * Represents entitlements unlocked by payment
 */
@Entity({ name: 'payment_targets' })
export class PaymentTarget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'payment_intent_id' })
  paymentIntentId: string;

  @ManyToOne(() => PaymentIntent, (intent) => intent.targets)
  @JoinColumn({ name: 'payment_intent_id' })
  paymentIntent: PaymentIntent;

  @Column({
    type: 'enum',
    enum: PaymentTargetType,
    name: 'target_type',
  })
  targetType: PaymentTargetType;

  @Column({ type: 'uuid', name: 'target_id' })
  targetId: string;

  @Column({
    type: 'enum',
    enum: PaymentContextType,
    name: 'context_type',
  })
  contextType: PaymentContextType;

  @Column({ type: 'uuid', name: 'context_id' })
  contextId: string;

  @Column({
    type: 'enum',
    enum: PaymentTargetUnlockStatus,
    default: PaymentTargetUnlockStatus.LOCKED,
    name: 'unlock_status',
  })
  unlockStatus: PaymentTargetUnlockStatus;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'unlocked_at' })
  unlockedAt: Date;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}

