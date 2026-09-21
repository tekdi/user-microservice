import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';

/**
 * Aspire Leaders-specific: the cohort-free counterpart of
 * CohortMembersReportFilterDto.
 *
 * The cohort version answers "which of these userIds are in this cohort AND
 * within my country scope", which is the wrong question for a report that has
 * no cohort at all - the pathway assessment report, for one, is scoped by a
 * pathway. Asking it anyway is what made those reports come back empty: the
 * pathway's id matches no cohortMembers row, and the filter fails closed.
 *
 * So this asks only the country half, against Users.currentCountry.
 *
 * No role or country-scope fields here by design: the caller's own allowed
 * countries are resolved server-side from their token-derived identity and are
 * never accepted from the caller. `countries` below is a NARROWING within that
 * scope, not the scope itself.
 */
export class ReportCountryFilterDto {
  @ApiProperty({
    type: [String],
    description:
      'Chunk of userIds to country-check (e.g. one page of a report source)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(2000)
  userIds: string[];

  /**
   * Country NAMES from the admin UI's Country dropdown. Optional - omit for no
   * narrowing.
   *
   * Can only ever SUBTRACT from the caller's own server-resolved scope, so a
   * Regional Admin cannot use it to reach outside their assigned countries.
   *
   * NOTE: this route runs ValidationPipe({ whitelist: true }), so this field
   * MUST stay declared here - an undeclared property is silently stripped from
   * the body, which would make a caller's narrowing quietly disappear.
   */
  @ApiProperty({
    required: false,
    type: [String],
    description:
      "Country NAMES to narrow to, matched against each user's live currentCountry",
    example: ['India', 'Kenya'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];
}
