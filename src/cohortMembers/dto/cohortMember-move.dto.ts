import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { MemberStatus } from '../entities/cohort-member.entity';

/**
 * Moves one user from one cohort to another within the same academic year.
 *
 * The source membership is deactivated rather than deleted, so the history of
 * the user having been in that cohort - and any form submission or progress
 * hanging off that membership row - survives the move.
 */
export class CohortMemberMoveDto {
  @ApiProperty({
    type: String,
    description: 'The user to move',
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: 'userId must be a valid UUID' })
  userId: string;

  @ApiProperty({
    type: String,
    description: 'Cohort the user is moving out of. Its membership is set to inactive.',
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: 'fromCohortId must be a valid UUID' })
  fromCohortId: string;

  @ApiProperty({
    type: String,
    description:
      'Cohort the user is moving into. Set to shortlisted, whether the membership is created or already existed in some other status.',
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID(undefined, { message: 'toCohortId must be a valid UUID' })
  toCohortId: string;

  @ApiPropertyOptional({
    enum: MemberStatus,
    default: MemberStatus.SHORTLISTED,
    description:
      'Status to put the destination membership in. Defaults to shortlisted. LMS enrollment runs only when this resolves to shortlisted, matching every other path in the service, where enrollment is a consequence of that status rather than of the operation.',
  })
  @Expose()
  @IsOptional()
  @IsEnum(MemberStatus, {
    message: `status must be one of: ${Object.values(MemberStatus).join(', ')}`,
  })
  status?: MemberStatus;

  @ApiPropertyOptional({
    enum: MemberStatus,
    default: MemberStatus.INACTIVE,
    description:
      'Status to leave the source membership in. Defaults to inactive. The row is always updated, never deleted, whichever status is used.',
  })
  @Expose()
  @IsOptional()
  @IsEnum(MemberStatus, {
    message: `fromStatus must be one of: ${Object.values(MemberStatus).join(', ')}`,
  })
  fromStatus?: MemberStatus;

  @ApiPropertyOptional({
    type: String,
    description:
      'Reason recorded against both memberships. Defaults to a generated note naming the other cohort.',
  })
  @Expose()
  @IsOptional()
  @IsString()
  statusReason?: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
