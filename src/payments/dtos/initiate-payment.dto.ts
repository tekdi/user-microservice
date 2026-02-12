import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentPurpose, PaymentTargetType, PaymentContextType } from '../enums/payment.enums';

// Update the metadata class as per the use case
export class PaymentMetadataDto {
  @ApiProperty({ description: 'Cohort ID', required: false })
  @IsOptional()
  @IsUUID()
  cohortId?: string;

  @ApiProperty({ description: 'Course ID', required: false })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiProperty({ description: 'Price snapshot at time of payment', required: false })
  @IsOptional()
  @IsNumber()
  priceSnapshot?: number;
}

export class PaymentTargetDto {
  @ApiProperty({ enum: PaymentTargetType, description: 'Type of target being unlocked' })
  @IsNotEmpty()
  @IsEnum(PaymentTargetType)
  targetType: PaymentTargetType;

  @ApiProperty({ description: 'ID of the target (e.g., certificate bundle ID)' })
  @IsNotEmpty()
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: PaymentContextType, description: 'Context type (e.g., COHORT)' })
  @IsNotEmpty()
  @IsEnum(PaymentContextType)
  contextType: PaymentContextType;

  @ApiProperty({ description: 'Context ID (e.g., cohort ID)' })
  @IsNotEmpty()
  @IsUUID()
  contextId: string;
}

export class InitiatePaymentDto {
  @ApiProperty({ description: 'User ID making the payment' })
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: PaymentPurpose, description: 'Purpose of the payment' })
  @IsNotEmpty()
  @IsEnum(PaymentPurpose)
  purpose: PaymentPurpose;

  @ApiProperty({ description: 'Payment amount', minimum: 0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Currency code (e.g., INR, USD)', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: PaymentMetadataDto, required: false, description: 'Additional metadata' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentMetadataDto)
  metadata?: PaymentMetadataDto;

  @ApiProperty({ type: [PaymentTargetDto], description: 'Targets to unlock after payment' })
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PaymentTargetDto)
  targets: PaymentTargetDto[];

  @ApiProperty({ 
    description: 'Stripe promo code/coupon ID to apply automatically', 
    required: false 
  })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiProperty({ 
    description: 'Allow users to enter promo codes in checkout UI', 
    required: false,
    default: false 
  })
  @IsOptional()
  allowPromotionCodes?: boolean;

  @ApiProperty({ 
    description: 'Base URL to redirect after successful payment (e.g., https://learner-qa.aspireleaders.org/profile). The session_id parameter will be automatically appended. Stripe will replace {CHECKOUT_SESSION_ID} with the actual session ID when redirecting. The sessionId is also returned in the API response.', 
    required: false 
  })
  @IsOptional()
  @IsString()
  successUrl?: string;

  @ApiProperty({ 
    description: 'URL to redirect if payment is cancelled', 
    required: false 
  })
  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

