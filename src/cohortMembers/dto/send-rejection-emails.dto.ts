import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Optional body for POST cohortmember/cron/send-rejection-emails.
 */
export class SendRejectionEmailsDto {
  @ApiProperty({
    required: false,
    description:
      'When set, only this cohort is processed (must be in rejection-notification-date window).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'cohortId must be a valid UUID' })
  cohortId?: string;

  @ApiProperty({
    type: Number,
    description: 'Optional batch size override (defaults to BATCH_SIZE env)',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.batchSize !== undefined && o.batchSize !== null)
  @Type(() => Number)
  @IsInt({ message: 'batchSize must be an integer' })
  @Min(1, { message: 'batchSize must be at least 1' })
  batchSize?: number;
}
