import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsNumber, Min } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ description: 'Coupon code to validate', example: 'SAVE20' })
  @IsNotEmpty()
  @IsString()
  couponCode: string;

  @ApiProperty({ description: 'User ID applying the coupon' })
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Context type (COHORT, COURSE, or BUNDLE)',
    example: 'COHORT',
  })
  @IsNotEmpty()
  @IsString()
  contextType: string;

  @ApiProperty({ description: 'Context ID (cohortId, courseId, or bundleId)' })
  @IsNotEmpty()
  @IsString()
  contextId: string;

  @ApiProperty({
    type: 'number',
    description: 'Original amount before discount',
    example: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  originalAmount: number;

  @ApiProperty({
    description: 'Country ID (optional, for country-specific coupons)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  countryId?: string;
}

export class ValidateCouponResponseDto {
  @ApiProperty({ description: 'Whether the coupon is valid' })
  isValid: boolean;

  @ApiProperty({ description: 'Validation error message (if invalid)', required: false })
  error?: string;

  @ApiProperty({ description: 'Coupon details (if valid)', required: false })
  coupon?: {
    id: string;
    couponCode: string;
    discountType: string;
    discountValue: number;
    currency: string;
  };

  @ApiProperty({ description: 'Discounted amount', required: false })
  discountedAmount?: number;

  @ApiProperty({ description: 'Discount amount', required: false })
  discountAmount?: number;
}

