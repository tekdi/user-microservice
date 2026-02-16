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
  PaymentTransactionStatus,
  PaymentProvider,
} from '../enums/payment.enums';
import { PaymentIntent } from './payment-intent.entity';

/**
 * Payment Transaction Entity
 * Represents individual gateway attempts (1 intent can have many retries)
 */
@Entity({ name: 'payment_transactions' })
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'payment_intent_id' })
  paymentIntentId: string;

  @ManyToOne(() => PaymentIntent, (intent) => intent.transactions)
  @JoinColumn({ name: 'payment_intent_id' })
  paymentIntent: PaymentIntent;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
  })
  provider: PaymentProvider;

  @Column({ type: 'varchar', nullable: true, name: 'provider_payment_id' })
  providerPaymentId: string;

  @Column({ type: 'varchar', nullable: true, name: 'provider_session_id' })
  providerSessionId: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.INITIATED,
  })
  status: PaymentTransactionStatus;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason: string;

  @Column({ type: 'jsonb', nullable: true, name: 'raw_response' })
  rawResponse: any;

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

