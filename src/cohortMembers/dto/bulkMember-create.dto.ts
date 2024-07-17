import { IsArray, IsUUID, ArrayNotEmpty, IsOptional, IsNotEmpty } from 'class-validator';

export class BulkCohortMember {
  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty()
  @IsUUID('4', { each: true })
  userId: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty()
  @IsUUID('4', { each: true })
  cohortId: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsOptional()
  @IsUUID('4', { each: true })
  removeCohortId: string[];

}
