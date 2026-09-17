import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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
