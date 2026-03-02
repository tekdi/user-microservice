import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import {
  PaymentIntentStatus,
  PaymentPurpose,
  PaymentProvider,
} from '../enums/payment.enums';
import { PaymentTransaction } from './payment-transaction.entity';
import { PaymentTarget } from './payment-target.entity';

/**
 * Payment Intent Entity
 * Represents one logical purchase/transaction
 */
@Entity({ name: 'payment_intents' })
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({
    type: 'enum',
    enum: PaymentPurpose,
    name: 'purpose',
  })
  purpose: PaymentPurpose;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentIntentStatus,
    default: PaymentIntentStatus.CREATED,
  })
  status: PaymentIntentStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.STRIPE,
  })
  provider: PaymentProvider;

  @Column({ type: 'text', nullable: true, name: 'status_reason' })
  statusReason: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    cohortId?: string;
    courseId?: string;
    priceSnapshot?: number;
    [key: string]: any;
  };

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

  @OneToMany(
    () => PaymentTransaction,
    (transaction) => transaction.paymentIntent,
  )
  transactions: PaymentTransaction[];

  @OneToMany(() => PaymentTarget, (target) => target.paymentIntent)
  targets: PaymentTarget[];
}

