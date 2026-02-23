import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsUUID,
  IsBoolean,
  Min,
  IsDateString,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { PaymentContextType } from '../enums/payment.enums';
import { DiscountType } from '../entities/discount-coupon.entity';

/**
 * Custom validator for percentage discount max value
 * Only applies Max(100) validation when discountType is PERCENT
 */
function MaxPercentDiscount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxPercentDiscount',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          const obj = args.object as CreateCouponDto;
          // Only validate max if discount type is PERCENT
          if (obj.discountType === DiscountType.PERCENT) {
            return typeof value === 'number' && value <= 100;
          }
          // For FIXED type, skip this validator (other validators still apply)
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return 'Percentage discount must be between 0 and 100';
        },
      },
    });
  };
}

export class CreateCouponDto {
  @ApiProperty({ description: 'Coupon code (e.g., SAVE20)', example: 'SAVE20' })
  @IsNotEmpty()
  @IsString()
  couponCode: string;

  @ApiProperty({
    description: 'Stripe promotion code ID (optional, will be set when synced with Stripe)',
    required: false,
  })
  @IsOptional()
  @IsString()
  stripePromoCodeId?: string;

  @ApiProperty({
    enum: PaymentContextType,
    description: 'Context type (COHORT, COURSE, or BUNDLE)',
  })
  @IsNotEmpty()
  @IsEnum(PaymentContextType)
  contextType: PaymentContextType;

  @ApiProperty({ description: 'Context ID (cohortId, courseId, or bundleId)' })
  @IsNotEmpty()
  @IsString()
  contextId: string;

  @ApiProperty({
    enum: DiscountType,
    description: 'Discount type (PERCENT or FIXED)',
  })
  @IsNotEmpty()
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({
    description: 'Discount value (percentage 0-100 for PERCENT, or fixed amount for FIXED)',
    example: 20,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @MaxPercentDiscount()
  discountValue: number;

  @ApiProperty({ description: 'Currency code', default: 'USD', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    description: 'Country ID (null for global coupon)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  countryId?: string | null;

  @ApiProperty({ description: 'Whether the coupon is active', default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Valid from date (ISO string)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiProperty({
    description: 'Valid till date (ISO string)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  validTill?: string | null;

  @ApiProperty({
    description: 'Maximum total redemptions (null for unlimited)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number | null;

  @ApiProperty({
    description: 'Maximum redemptions per user (null for unlimited)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptionsPerUser?: number | null;
}

/**
 * Update Coupon DTO
 * All fields are optional, but validation decorators are preserved
 */
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

