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
import { User } from '../../user/entities/user-entity';
import { Country } from '../../countries/entities/country.entity';
import { CreateCouponDto, UpdateCouponDto } from '../dtos/create-coupon.dto';
import { ValidateCouponDto, ValidateCouponResponseDto, ValidateCouponInput } from '../dtos/validate-coupon.dto';
import { PaymentContextType } from '../enums/payment.enums';

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(DiscountCoupon)
    private readonly couponRepository: Repository<DiscountCoupon>,
    @InjectRepository(CouponRedemption)
    private readonly redemptionRepository: Repository<CouponRedemption>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
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
    const existing = await this.couponRepository.findOne({
      where: { couponCode: dto.couponCode },
    });

    if (existing) {
      if (existing.isActive) {
        throw new BadRequestException(`Coupon code ${dto.couponCode} already exists`);
      }
      // Same code is reserved by an inactive row (unique constraint). Reuse the row:
      // stable couponId for reporting/redemptions, new terms from this payload.
      existing.contextType = dto.contextType;
      existing.contextId = dto.contextId;
      existing.discountType = dto.discountType;
      existing.discountValue = dto.discountValue;
      existing.currency = dto.currency || 'USD';
      existing.countryId = dto.countryId ?? null;
      existing.isActive = dto.isActive ?? true;
      existing.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
      existing.validTill = dto.validTill ? new Date(dto.validTill) : null;
      existing.maxRedemptions = dto.maxRedemptions ?? null;
      existing.maxRedemptionsPerUser = dto.maxRedemptionsPerUser ?? null;
      if (dto.stripePromoCodeId !== undefined) {
        existing.stripePromoCodeId = dto.stripePromoCodeId ?? null;
      }

      const savedCoupon = await this.couponRepository.save(existing);
      if (this.stripe && !dto.stripePromoCodeId) {
        try {
          await this.syncCouponToStripe(savedCoupon);
        } catch (error) {
          this.logger.warn(
            `Failed to sync reactivated coupon ${savedCoupon.id} to Stripe: ${error.message}`,
          );
        }
      }
      this.logger.log(
        `Reactivated inactive coupon: ${savedCoupon.couponCode} (${savedCoupon.id})`,
      );
      return savedCoupon;
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
      isActive: dto.isActive ?? true,
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
   * Stripe coupons are immutable: percent_off, amount_off, max_redemptions, redeem_by cannot be
   * changed after creation. Compare DB state to the Stripe coupon we would create.
   */
  private stripeCouponMatchesEntity(
    stripeCoupon: Stripe.Coupon,
    entity: DiscountCoupon,
  ): boolean {
    if (entity.discountType === DiscountType.PERCENT) {
      if (stripeCoupon.percent_off == null) {
        return false;
      }
      if (Number(stripeCoupon.percent_off) !== Number(entity.discountValue)) {
        return false;
      }
    } else {
      const expectedCents = Math.round(Number(entity.discountValue) * 100);
      if (
        stripeCoupon.amount_off !== expectedCents ||
        stripeCoupon.currency !== entity.currency.toLowerCase()
      ) {
        return false;
      }
    }

    const entityMax = entity.maxRedemptions ?? null;
    const stripeMax = stripeCoupon.max_redemptions ?? null;
    if (entityMax !== stripeMax) {
      return false;
    }

    const expectedRedeemBy = entity.validTill
      ? Math.floor(new Date(entity.validTill).getTime() / 1000)
      : null;
    const stripeRedeemBy = stripeCoupon.redeem_by ?? null;
    if (expectedRedeemBy !== stripeRedeemBy) {
      return false;
    }

    return true;
  }

  private promotionCodeCouponId(promo: Stripe.PromotionCode): string {
    return typeof promo.coupon === 'string' ? promo.coupon : promo.coupon.id;
  }

  /**
   * Sync coupon to Stripe
   */
  async syncCouponToStripe(coupon: DiscountCoupon): Promise<void> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    try {
      const desiredCouponId = coupon.couponCode.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const stripeCouponParams: Stripe.CouponCreateParams = {
        id: desiredCouponId,
        name: coupon.couponCode,
      };

      if (coupon.discountType === DiscountType.PERCENT) {
        const percentOff = Number(coupon.discountValue);
        if (percentOff < 0 || percentOff > 100) {
          throw new BadRequestException('Percentage discount must be between 0 and 100');
        }
        stripeCouponParams.percent_off = percentOff;
      } else {
        stripeCouponParams.amount_off = Math.round(
          Number(coupon.discountValue) * 100,
        );
        stripeCouponParams.currency = coupon.currency.toLowerCase();
      }

      if (coupon.maxRedemptions) {
        stripeCouponParams.max_redemptions = coupon.maxRedemptions;
      }

      if (coupon.validFrom || coupon.validTill) {
        stripeCouponParams.redeem_by = coupon.validTill
          ? Math.floor(new Date(coupon.validTill).getTime() / 1000)
          : undefined;
      }

      const paramsForNewCoupon: Stripe.CouponCreateParams = { ...stripeCouponParams };
      delete paramsForNewCoupon.id;

      let stripeCoupon: Stripe.Coupon;
      try {
        stripeCoupon = await this.stripe.coupons.create(stripeCouponParams);
      } catch (error) {
        if (error.code === 'resource_already_exists') {
          const existing = await this.stripe.coupons.retrieve(desiredCouponId);
          if (this.stripeCouponMatchesEntity(existing, coupon)) {
            stripeCoupon = existing;
          } else {
            this.logger.log(
              `Stripe coupon ${desiredCouponId} exists but does not match DB; creating new Stripe coupon (immutable fields changed)`,
            );
            if (coupon.stripePromoCodeId) {
              try {
                await this.stripe.promotionCodes.update(coupon.stripePromoCodeId, {
                  active: false,
                });
              } catch (deactErr) {
                if (deactErr.code !== 'resource_missing') {
                  throw deactErr;
                }
              }
            }
            stripeCoupon = await this.stripe.coupons.create(paramsForNewCoupon);
          }
        } else {
          throw error;
        }
      }

      if (coupon.stripePromoCodeId) {
        try {
          const existingPromo = await this.stripe.promotionCodes.retrieve(
            coupon.stripePromoCodeId,
          );
          if (this.promotionCodeCouponId(existingPromo) === stripeCoupon.id) {
            await this.stripe.promotionCodes.update(coupon.stripePromoCodeId, {
              active: coupon.isActive,
            });
            this.logger.log(
              `Updated existing Stripe promotion code ${coupon.stripePromoCodeId} for coupon ${coupon.couponCode}`,
            );
            return;
          }
          try {
            await this.stripe.promotionCodes.update(coupon.stripePromoCodeId, {
              active: false,
            });
            this.logger.log(
              `Deactivated Stripe promotion code ${coupon.stripePromoCodeId} (replaced after coupon terms change)`,
            );
          } catch (deactErr) {
            if (deactErr.code !== 'resource_missing') {
              throw deactErr;
            }
          }
        } catch (error) {
          if (error.code === 'resource_missing') {
            this.logger.warn(
              `Promotion code ${coupon.stripePromoCodeId} not found in Stripe, creating new one`,
            );
          } else {
            throw error;
          }
        }
      }

      const promoCode = await this.stripe.promotionCodes.create({
        coupon: stripeCoupon.id,
        code: coupon.couponCode,
        active: coupon.isActive,
        max_redemptions: coupon.maxRedemptions || undefined,
      });
      coupon.stripePromoCodeId = promoCode.id;
      await this.couponRepository.save(coupon);
      this.logger.log(
        `Created Stripe promotion code ${promoCode.id} for coupon ${coupon.couponCode}`,
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
    dto: ValidateCouponInput,
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

    // Check country restriction: coupon stores countryId; user's country comes from users table.
    // Resolve user's country to countries table id and compare with coupon.countryId.
    if (coupon.countryId) {
      const user = await this.userRepository.findOne({
        where: { userId: dto.userId },
        select: ['userId', 'country'],
      });
      const userCountryValue = user?.country?.trim();
      if (!userCountryValue) {
        return {
          isValid: false,
          error: 'Coupon is not valid for this country',
        };
      }
      const country = await this.countryRepository
        .createQueryBuilder('country')
        .where('LOWER(country.name) = LOWER(:name)', { name: userCountryValue })
        .andWhere('country.is_active = :isActive', { isActive: true })
        .getOne();
      if (!country || country.id !== coupon.countryId) {
        return {
          isValid: false,
          error: 'Coupon is not valid for this country',
        };
      }
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
    const originalAmount = dto.originalAmount;
    let discountAmount = 0;
    let discountedAmount = originalAmount;

    if (coupon.discountType === DiscountType.PERCENT) {
      const percentValue = Math.min(Number(coupon.discountValue), 100);
      discountAmount = (originalAmount * percentValue) / 100;
      discountedAmount = Math.max(0, originalAmount - discountAmount);
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
      // Re-check max redemptions within transaction with lock
      const lockedCoupon = await manager.findOne(DiscountCoupon, {
        where: { id: couponId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedCoupon) {
        throw new NotFoundException(`Coupon ${couponId} not found`);
      }

      if (
        lockedCoupon.maxRedemptions &&
        lockedCoupon.currentRedemptions >= lockedCoupon.maxRedemptions
      ) {
        throw new BadRequestException('Coupon has reached maximum redemptions');
      }

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
   * List all coupons with optional filters and pagination
   */
  async listCoupons(
    filters?: {
      contextType?: PaymentContextType;
      contextId?: string;
      isActive?: boolean;
      search?: string;
    },
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: DiscountCoupon[]; totalCount: number }> {
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

    const searchTrimmed = filters?.search?.trim();
    if (searchTrimmed) {
      query.andWhere('LOWER(coupon.couponCode) LIKE LOWER(:search)', {
        search: `%${searchTrimmed}%`,
      });
    }

    // Get total count before pagination
    const totalCount = await query.getCount();

    // Apply pagination and ordering
    const data = await query
      .orderBy('coupon.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { data, totalCount };
  }

  /**
   * Update coupon
   */
  async updateCoupon(
    id: string,
    updates: UpdateCouponDto,
  ): Promise<DiscountCoupon> {
    const coupon = await this.couponRepository.findOne({ where: { id } });

    if (!coupon) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    // Update fields explicitly to handle date conversions and null values properly
    if (updates.couponCode !== undefined) {
      if (updates.couponCode !== coupon.couponCode) {
        const existing = await this.couponRepository.findOne({
          where: { couponCode: updates.couponCode },
        });
        if (existing) {
          throw new BadRequestException(
            `Coupon code ${updates.couponCode} already exists`,
          );
        }
      }
      coupon.couponCode = updates.couponCode;
    }
    if (updates.stripePromoCodeId !== undefined) {
      coupon.stripePromoCodeId = updates.stripePromoCodeId;
    }
    if (updates.contextType !== undefined) {
      coupon.contextType = updates.contextType;
    }
    if (updates.contextId !== undefined) {
      coupon.contextId = updates.contextId;
    }
    if (updates.discountType !== undefined) {
      coupon.discountType = updates.discountType;
    }
    if (updates.discountValue !== undefined) {
      coupon.discountValue = updates.discountValue;
    }
    if (updates.currency !== undefined) {
      coupon.currency = updates.currency;
    }
    if (updates.countryId !== undefined) {
      coupon.countryId = updates.countryId;
    }
    if (updates.isActive !== undefined) {
      coupon.isActive = updates.isActive;
    }
    // Handle date fields: allow explicit null values and convert strings to Date
    if (updates.validFrom !== undefined) {
      coupon.validFrom = updates.validFrom ? new Date(updates.validFrom) : null;
    }
    if (updates.validTill !== undefined) {
      coupon.validTill = updates.validTill ? new Date(updates.validTill) : null;
    }
    if (updates.maxRedemptions !== undefined) {
      coupon.maxRedemptions = updates.maxRedemptions;
    }
    if (updates.maxRedemptionsPerUser !== undefined) {
      coupon.maxRedemptionsPerUser = updates.maxRedemptionsPerUser;
    }

    const updated = await this.couponRepository.save(coupon);

    if (this.stripe) {
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

