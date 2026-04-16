import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Optional body for POST cohortmember/cron/send-shortlisting-emails.
 * When both cohortId and userId are set, only that cohort member may receive mail
 * (cohort in shortlist *notification* date window, shortlisted, email not yet sent).
 * Omit both for default batch behavior across all eligible cohorts.
 */
export class SendShortlistingEmailsDto {
  @ApiProperty({
    required: false,
    description:
      'Cohort UUID; must be sent together with userId for targeted send',
  })
  @IsOptional()
  @IsUUID('4', { message: 'cohortId must be a valid UUID' })
  cohortId?: string;

  @ApiProperty({
    required: false,
    description:
      'Applicant user UUID; must be sent together with cohortId for targeted send',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId?: string;
}
