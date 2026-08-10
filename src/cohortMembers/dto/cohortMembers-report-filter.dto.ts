import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';

/**
 * Aspire Leaders-specific lean reporting request: a cohort plus a chunk of
 * enrolled/participant userIds (as paginated by LMS/Assessment/Event/Referral
 * report sources). No role or country fields here by design - both are
 * resolved server-side from the calling admin's identity, never accepted from
 * the caller (see docs/regional-admin-cohort-country-report.md, Decisions 2 & 3).
 */
export class CohortMembersReportFilterDto {
  @ApiProperty({
    description: 'Cohort to filter within',
    example: 'a1b2c3d4-e111-2222-3333-444455556666',
  })
  @IsUUID()
  cohortId: string;

  @ApiProperty({
    type: [String],
    description:
      'Chunk of userIds to check membership/country-eligibility for (e.g. one LMS report page)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(2000)
  userIds: string[];
}
