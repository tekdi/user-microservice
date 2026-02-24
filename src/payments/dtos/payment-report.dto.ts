import { ApiProperty } from '@nestjs/swagger';

export class PaymentReportItemDto {
  @ApiProperty({ type: 'string', description: 'First Name of the user', nullable: true })
  firstName: string | null;

  @ApiProperty({ type: 'string', description: 'Last Name of the user', nullable: true })
  lastName: string | null;

  @ApiProperty({ type: 'string', description: 'Email of the user', nullable: true })
  email: string | null;

  @ApiProperty({ type: 'number', description: 'Actual amount before discount' })
  actualAmount: number;

  @ApiProperty({ type: 'number', description: 'Paid amount after discount' })
  paidAmount: number;

  @ApiProperty({ type: 'string', description: 'Discount coupon code applied, or null if none', nullable: true })
  discountApplied: string | null;

  @ApiProperty({ type: 'number', description: 'Discount amount, or null if no discount', nullable: true })
  discountAmount: number | null;

  @ApiProperty({ type: 'string', description: 'Transaction ID' })
  transactionId: string;

  @ApiProperty({ type: 'string', format: 'date-time', description: 'Transaction time' })
  transactionTime: Date;

  @ApiProperty({ type: 'string', description: 'Payment status (PAID, FAILED, PENDING)' })
  status: string;
}

export class PaymentReportResponseDto {
  @ApiProperty({ type: [PaymentReportItemDto], description: 'List of payment report items' })
  data: PaymentReportItemDto[];

  @ApiProperty({ type: 'number', description: 'Total number of records' })
  totalCount: number;

  @ApiProperty({ type: 'number', description: 'Current page limit' })
  limit: number;

  @ApiProperty({ type: 'number', description: 'Current page offset' })
  offset: number;

  @ApiProperty({ type: 'boolean', description: 'Whether there are more records available' })
  hasMore: boolean;
}

