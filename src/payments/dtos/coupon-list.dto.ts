import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountCoupon } from '../entities/discount-coupon.entity';
import { PaymentContextType } from '../enums/payment.enums';

export class CouponListRequestDto {
  @ApiProperty({
    enum: PaymentContextType,
    required: false,
    description: 'Filter by context type (COHORT, COURSE, BUNDLE)',
  })
  @IsOptional()
  @IsEnum(PaymentContextType)
  contextType?: PaymentContextType;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Filter by context ID',
  })
  @IsOptional()
  @IsString()
  contextId?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'Filter by active status',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({
    type: Number,
    required: false,
    default: 10,
    minimum: 1,
    maximum: 1000,
    description: 'Number of records to return (default: 10, max: 1000)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiProperty({
    type: Number,
    required: false,
    default: 0,
    minimum: 0,
    description: 'Number of records to skip (default: 0)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}

export class CouponListResponseDto {
  @ApiProperty({ type: [DiscountCoupon], description: 'List of coupons' })
  data: DiscountCoupon[];

  @ApiProperty({ type: 'number', description: 'Total number of records' })
  totalCount: number;

  @ApiProperty({ type: 'number', description: 'Number of records requested per page' })
  limit: number;

  @ApiProperty({ type: 'number', description: 'Number of records skipped' })
  offset: number;

  @ApiProperty({ type: 'boolean', description: 'Indicates if there are more records available' })
  hasMore: boolean;
}

