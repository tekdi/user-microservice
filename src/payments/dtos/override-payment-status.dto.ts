import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentIntentStatus } from '../enums/payment.enums';

export class OverridePaymentStatusDto {
  @ApiProperty({
    enum: PaymentIntentStatus,
    description:
      'New payment status to set (CREATED, PAID, FAILED, REFUNDED). When set to PAID, targets are unlocked and certificate generation is triggered if applicable.',
  })
  @IsEnum(PaymentIntentStatus)
  status: PaymentIntentStatus;

  @ApiProperty({
    description: 'Reason for the manual status override (required for audit).',
    example: 'Customer confirmed bank transfer received',
  })
  @IsNotEmpty({ message: 'reason is required for manual status override' })
  @IsString()
  reason: string;
}
