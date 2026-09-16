import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  ArrayMaxSize,
  IsIn,
  IsOptional,
} from 'class-validator';

/**
 * Which country a report means when it says "this member's country".
 *
 * - 'applicationCountry' (default, and the only behaviour before this existed):
 *   CohortMembers.user_cohort_country_id - the country frozen at the moment the
 *   user applied to this cohort. Correct for application-shaped reports, where
 *   the country is a property of the application itself.
 * - 'currentCountry': Users.currentCountry, resolved live on every call - where
 *   the user is NOW, regardless of what they put on an old application. Correct
 *   for progress-shaped reports (e.g. the content report).
 */
export type ReportCountrySource = 'applicationCountry' | 'currentCountry';

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
    example: 'a1b2c3d4-e111-4222-8333-444455556666',
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

  /**
   * Which country this report filters on - see ReportCountrySource. Optional;
   * omitting it keeps the original 'applicationCountry' behaviour, so every
   * existing caller is unaffected.
   *
   * NOTE: this route runs ValidationPipe({ whitelist: true }), so this field
   * MUST stay declared here - an undeclared property is silently stripped from
   * the body, which would make a caller's 'currentCountry' request quietly
   * fall back to applicationCountry.
   *
   * This selects a COLUMN, not a value: it cannot widen anyone's access. The
   * Regional Admin's own allowed countries are still resolved server-side from
   * their profile and are never accepted from the caller.
   */
  @ApiProperty({
    required: false,
    enum: ['applicationCountry', 'currentCountry'],
    description:
      "Country to filter on: 'applicationCountry' (frozen at application time, default) or 'currentCountry' (the user's live profile country)",
  })
  @IsOptional()
  @IsIn(['applicationCountry', 'currentCountry'])
  countrySource?: ReportCountrySource;
}
