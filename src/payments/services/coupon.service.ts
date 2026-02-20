import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DiscountCoupon, DiscountType } from '../entities/discount-coupon.entity';
import { CouponRedemption } from '../entities/coupon-redemption.entity';
import { CreateCouponDto } from '../dtos/create-coupon.dto';
import { ValidateCouponDto, ValidateCouponResponseDto } from '../dtos/validate-coupon.dto';
import { PaymentContextType } from '../enums/payment.enums';

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(DiscountCoupon)
    private couponRepository: Repository<DiscountCoupon>,
    @InjectRepository(CouponRedemption)
    private redemptionRepository: Repository<CouponRedemption>,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2023-10-16',
      });
    }
  }

  /**
   * Create a new coupon
   */
  async createCoupon(dto: CreateCouponDto): Promise<DiscountCoupon> {
    // Check if coupon code already exists
    const existing = await this.couponRepository.findOne({
      where: { couponCode: dto.couponCode },
    });

    if (existing) {
      throw new BadRequestException(`Coupon code ${dto.couponCode} already exists`);
    }

    // Create coupon in database
    const coupon = this.couponRepository.create({
      couponCode: dto.couponCode,
      stripePromoCodeId: dto.stripePromoCodeId || null,
      contextType: dto.contextType,
      contextId: dto.contextId,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      currency: dto.currency || 'USD',
      countryId: dto.countryId || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTill: dto.validTill ? new Date(dto.validTill) : null,
      maxRedemptions: dto.maxRedemptions || null,
      maxRedemptionsPerUser: dto.maxRedemptionsPerUser || null,
      currentRedemptions: 0,
    });

    const savedCoupon = await this.couponRepository.save(coupon);

    // Optionally sync with Stripe
    if (this.stripe && !dto.stripePromoCodeId) {
      try {
        await this.syncCouponToStripe(savedCoupon);
      } catch (error) {
        this.logger.warn(
          `Failed to sync coupon ${savedCoupon.id} to Stripe: ${error.message}`,
        );
        // Don't fail the creation if Stripe sync fails
      }
    }

    this.logger.log(`Created coupon: ${savedCoupon.couponCode} (${savedCoupon.id})`);
    return savedCoupon;
  }

  /**
   * Sync coupon to Stripe
   */
  async syncCouponToStripe(coupon: DiscountCoupon): Promise<void> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    try {
      // Create or update Stripe coupon
      const stripeCouponParams: Stripe.CouponCreateParams = {
        id: coupon.couponCode.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: coupon.couponCode,
        currency: coupon.currency.toLowerCase(),
      };

      if (coupon.discountType === DiscountType.PERCENT) {
        stripeCouponParams.percent_off = Number(coupon.discountValue);
      } else {
        stripeCouponParams.amount_off = Math.round(
          Number(coupon.discountValue) * 100, // Convert to cents
        );
        stripeCouponParams.currency = coupon.currency.toLowerCase();
      }

      // Set redemption limits
      if (coupon.maxRedemptions) {
        stripeCouponParams.max_redemptions = coupon.maxRedemptions;
      }

      // Set validity period
      if (coupon.validFrom || coupon.validTill) {
        stripeCouponParams.redeem_by = coupon.validTill
          ? Math.floor(new Date(coupon.validTill).getTime() / 1000)
          : undefined;
      }

      // Try to create the coupon
      let stripeCoupon: Stripe.Coupon;
      try {
        stripeCoupon = await this.stripe.coupons.create(stripeCouponParams);
      } catch (error) {
        // If coupon already exists, retrieve it
        if (error.code === 'resource_already_exists') {
          stripeCoupon = await this.stripe.coupons.retrieve(
            stripeCouponParams.id as string,
          );
        } else {
          throw error;
        }
      }

      // Create promotion code
      const promoCode = await this.stripe.promotionCodes.create({
        coupon: stripeCoupon.id,
        code: coupon.couponCode,
        active: coupon.isActive,
        max_redemptions: coupon.maxRedemptions || undefined,
      });

      // Update coupon with Stripe promotion code ID
      coupon.stripePromoCodeId = promoCode.id;
      await this.couponRepository.save(coupon);

      this.logger.log(
        `Synced coupon ${coupon.couponCode} to Stripe (promo code: ${promoCode.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync coupon ${coupon.couponCode} to Stripe: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Validate a coupon for a specific user and context
   */
  async validateCoupon(
    dto: ValidateCouponDto,
  ): Promise<ValidateCouponResponseDto> {
    const coupon = await this.couponRepository.findOne({
      where: { couponCode: dto.couponCode },
    });

    if (!coupon) {
      return {
        isValid: false,
        error: 'Coupon not found',
      };
    }

    // Check if coupon is active
    if (!coupon.isActive) {
      return {
        isValid: false,
        error: 'Coupon is not active',
      };
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return {
        isValid: false,
        error: 'Coupon is not yet valid',
      };
    }

    if (coupon.validTill && now > coupon.validTill) {
      return {
        isValid: false,
        error: 'Coupon has expired',
      };
    }

    // Check context match
    if (
      coupon.contextType !== dto.contextType ||
      coupon.contextId !== dto.contextId
    ) {
      return {
        isValid: false,
        error: 'Coupon is not valid for this context',
      };
    }

    // Check country restriction
    if (coupon.countryId && coupon.countryId !== dto.countryId) {
      return {
        isValid: false,
        error: 'Coupon is not valid for this country',
      };
    }

    // Check max redemptions
    if (
      coupon.maxRedemptions &&
      coupon.currentRedemptions >= coupon.maxRedemptions
    ) {
      return {
        isValid: false,
        error: 'Coupon has reached maximum redemptions',
      };
    }

    // Check max redemptions per user
    if (coupon.maxRedemptionsPerUser) {
      const userRedemptions = await this.redemptionRepository.count({
        where: {
          couponId: coupon.id,
          userId: dto.userId,
        },
      });

      if (userRedemptions >= coupon.maxRedemptionsPerUser) {
        return {
          isValid: false,
          error: 'You have reached the maximum redemptions for this coupon',
        };
      }
    }

    // Calculate discount
    const originalAmount = parseFloat(dto.originalAmount);
    let discountAmount = 0;
    let discountedAmount = originalAmount;

    if (coupon.discountType === DiscountType.PERCENT) {
      discountAmount = (originalAmount * Number(coupon.discountValue)) / 100;
      discountedAmount = originalAmount - discountAmount;
    } else {
      discountAmount = Number(coupon.discountValue);
      discountedAmount = Math.max(0, originalAmount - discountAmount);
    }

    return {
      isValid: true,
      coupon: {
        id: coupon.id,
        couponCode: coupon.couponCode,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        currency: coupon.currency,
      },
      discountedAmount: Math.round(discountedAmount * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
    };
  }

  /**
   * Record a coupon redemption
   */
  async recordRedemption(
    couponId: string,
    userId: string,
    paymentIntentId: string,
  ): Promise<CouponRedemption> {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon ${couponId} not found`);
    }

    // Check if already redeemed for this payment intent
    const existing = await this.redemptionRepository.findOne({
      where: {
        couponId,
        userId,
        paymentIntentId,
      },
    });

    if (existing) {
      return existing;
    }

    // Use transaction to ensure atomicity
    return await this.dataSource.transaction(async (manager) => {
      // Create redemption record
      const redemption = manager.create(CouponRedemption, {
        couponId,
        userId,
        paymentIntentId,
      });

      const savedRedemption = await manager.save(CouponRedemption, redemption);

      // Update coupon redemption count
      await manager.increment(
        DiscountCoupon,
        { id: couponId },
        'currentRedemptions',
        1,
      );

      this.logger.log(
        `Recorded redemption for coupon ${coupon.couponCode} by user ${userId}`,
      );

      return savedRedemption;
    });
  }

  /**
   * Get coupon by code
   */
  async getCouponByCode(couponCode: string): Promise<DiscountCoupon | null> {
    return await this.couponRepository.findOne({
      where: { couponCode },
      relations: ['redemptions'],
    });
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(id: string): Promise<DiscountCoupon | null> {
    return await this.couponRepository.findOne({
      where: { id },
      relations: ['redemptions'],
    });
  }

  /**
   * List all coupons with optional filters
   */
  async listCoupons(filters?: {
    contextType?: PaymentContextType;
    contextId?: string;
    isActive?: boolean;
  }): Promise<DiscountCoupon[]> {
    const query = this.couponRepository.createQueryBuilder('coupon');

    if (filters?.contextType) {
      query.andWhere('coupon.contextType = :contextType', {
        contextType: filters.contextType,
      });
    }

    if (filters?.contextId) {
      query.andWhere('coupon.contextId = :contextId', {
        contextId: filters.contextId,
      });
    }

    if (filters?.isActive !== undefined) {
      query.andWhere('coupon.isActive = :isActive', {
        isActive: filters.isActive,
      });
    }

    return await query.getMany();
  }

  /**
   * Update coupon
   */
  async updateCoupon(
    id: string,
    updates: Partial<CreateCouponDto>,
  ): Promise<DiscountCoupon> {
    const coupon = await this.couponRepository.findOne({ where: { id } });

    if (!coupon) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    // Update fields
    Object.assign(coupon, {
      ...updates,
      validFrom: updates.validFrom ? new Date(updates.validFrom) : coupon.validFrom,
      validTill: updates.validTill ? new Date(updates.validTill) : coupon.validTill,
    });

    const updated = await this.couponRepository.save(coupon);

    // Sync to Stripe if needed
    if (this.stripe && coupon.stripePromoCodeId) {
      try {
        await this.syncCouponToStripe(updated);
      } catch (error) {
        this.logger.warn(
          `Failed to sync updated coupon ${updated.id} to Stripe: ${error.message}`,
        );
      }
    }

    return updated;
  }

  /**
   * Delete coupon
   */
  async deleteCoupon(id: string): Promise<void> {
    const coupon = await this.couponRepository.findOne({ where: { id } });

    if (!coupon) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    await this.couponRepository.remove(coupon);
    this.logger.log(`Deleted coupon: ${coupon.couponCode} (${id})`);
  }
}

