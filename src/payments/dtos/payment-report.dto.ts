import { ApiProperty } from '@nestjs/swagger';

export class PaymentReportItemDto {
  @ApiProperty({ description: 'First Name of the user', nullable: true })
  firstName: string | null;

  @ApiProperty({ description: 'Last Name of the user', nullable: true })
  lastName: string | null;

  @ApiProperty({ description: 'Email of the user', nullable: true })
  email: string | null;

  @ApiProperty({ description: 'Actual amount before discount' })
  actualAmount: number;

  @ApiProperty({ description: 'Paid amount after discount' })
  paidAmount: number;

  @ApiProperty({ description: 'Discount coupon code applied, or null if none', nullable: true })
  discountApplied: string | null;

  @ApiProperty({ description: 'Discount amount, or null if no discount', nullable: true })
  discountAmount: number | null;

  @ApiProperty({ description: 'Transaction ID' })
  transactionId: string;

  @ApiProperty({ description: 'Transaction time' })
  transactionTime: Date;

  @ApiProperty({ description: 'Payment status (PAID, FAILED, PENDING)' })
  status: string;
}

export class PaymentReportResponseDto {
  @ApiProperty({ type: [PaymentReportItemDto], description: 'List of payment report items' })
  data: PaymentReportItemDto[];

  @ApiProperty({ description: 'Total number of records' })
  totalCount: number;
}

