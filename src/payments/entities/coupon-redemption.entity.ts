import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { DiscountCoupon } from './discount-coupon.entity';

/**
 * Coupon Redemption Entity
 * Tracks when and by whom coupons are redeemed
 */
@Entity({ name: 'coupon_redemptions' })
@Unique(['couponId', 'userId', 'paymentIntentId'])
export class CouponRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'coupon_id' })
  couponId: string;

  @ManyToOne(() => DiscountCoupon, (coupon) => coupon.redemptions)
  @JoinColumn({ name: 'coupon_id' })
  coupon: DiscountCoupon;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'payment_intent_id' })
  paymentIntentId: string;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'redeemed_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  redeemedAt: Date;
}

