import { ApiProperty } from '@nestjs/swagger';
import {
  PaymentIntentStatus,
  PaymentTransactionStatus,
  PaymentTargetUnlockStatus,
} from '../enums/payment.enums';

export class PaymentTargetStatusDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  targetType: string;

  @ApiProperty()
  targetId: string;

  @ApiProperty()
  contextType: string;

  @ApiProperty()
  contextId: string;

  @ApiProperty({ enum: PaymentTargetUnlockStatus })
  unlockStatus: PaymentTargetUnlockStatus;

  @ApiProperty({ nullable: true })
  unlockedAt: Date | null;
}

export class PaymentTransactionStatusDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  provider: string;

  @ApiProperty({ nullable: true })
  providerPaymentId: string | null;

  @ApiProperty({ enum: PaymentTransactionStatus })
  status: PaymentTransactionStatus;

  @ApiProperty({ nullable: true })
  failureReason: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaymentStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  purpose: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: PaymentIntentStatus })
  status: PaymentIntentStatus;

  @ApiProperty()
  provider: string;

  @ApiProperty({ nullable: true, description: 'Reason for manual status override, if any' })
  statusReason: string | null;

  @ApiProperty()
  metadata: any;

  @ApiProperty({ type: [PaymentTransactionStatusDto] })
  transactions: PaymentTransactionStatusDto[];

  @ApiProperty({ type: [PaymentTargetStatusDto] })
  targets: PaymentTargetStatusDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

