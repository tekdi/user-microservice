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
 * Optional body for POST cohortmember/cron/send-shortlisting-emails.
 * - cohortId only: all eligible shortlisted members in that cohort (must be in notification window).
 * - userId only (applicant): that user’s eligible shortlisted rows across all window cohorts.
 * - both: single member in that cohort.
 * Omit both for default batch across all eligible cohorts.
 */
export class SendShortlistingEmailsDto {
  @ApiProperty({
    required: false,
    description: 'Cohort UUID; alone = all shortlisted in cohort pending email',
  })
  @IsOptional()
  @IsUUID('4', { message: 'cohortId must be a valid UUID' })
  cohortId?: string;

  @ApiProperty({
    required: false,
    description:
      'Applicant user UUID; alone = that user across window cohorts; with cohortId = one member',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;

  @ApiProperty({
    type: Number,
    description:
      'Optional batch size (SQL LIMIT and parallel chunk size); defaults to BATCH_SIZE env',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.batchSize !== undefined && o.batchSize !== null)
  @Type(() => Number)
  @IsInt({ message: 'batchSize must be an integer' })
  @Min(1, { message: 'batchSize must be at least 1' })
  batchSize?: number;
}
