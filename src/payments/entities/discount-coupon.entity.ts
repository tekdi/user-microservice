import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PaymentContextType } from '../enums/payment.enums';
import { CouponRedemption } from './coupon-redemption.entity';

/**
 * Discount Type Enum
 */
export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

/**
 * Discount Coupon Entity
 * Wrapper for Stripe coupons with additional business logic
 */
@Entity({ name: 'discount_coupons' })
export class DiscountCoupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'coupon_code' })
  couponCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'stripe_promo_code_id' })
  stripePromoCodeId: string | null;

  @Column({
    type: 'enum',
    enum: PaymentContextType,
    name: 'context_type',
  })
  contextType: PaymentContextType;

  @Column({ type: 'varchar', length: 100, name: 'context_id' })
  contextId: string;

  @Column({
    type: 'enum',
    enum: DiscountType,
    name: 'discount_type',
  })
  discountType: DiscountType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    name: 'discount_value',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number.parseFloat(value),
    },
  })
  discountValue: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'uuid', nullable: true, name: 'country_id' })
  countryId: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'valid_from' })
  validFrom: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'valid_till' })
  validTill: Date | null;

  @Column({ type: 'integer', nullable: true, name: 'max_redemptions' })
  maxRedemptions: number | null;

  @Column({ type: 'integer', nullable: true, name: 'max_redemptions_per_user' })
  maxRedemptionsPerUser: number | null;

  @Column({ type: 'integer', default: 0, name: 'current_redemptions' })
  currentRedemptions: number;

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

  @OneToMany(() => CouponRedemption, (redemption) => redemption.coupon)
  redemptions: CouponRedemption[];
}

