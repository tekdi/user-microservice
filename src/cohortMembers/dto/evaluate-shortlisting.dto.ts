import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  ArrayNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluateShortlistingDto {
  @ApiProperty({
    type: Number,
    description: 'Batch size for processing cohort members',
    example: 5000,
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.batchSize !== undefined && o.batchSize !== null)
  @Type(() => Number)
  @IsInt({ message: 'batchSize must be an integer' })
  @Min(1, { message: 'batchSize must be at least 1' })
  batchSize?: number;

  @ApiProperty({
    type: [String],
    description: 'Array of user IDs to filter shortlisting evaluation. If provided, only these users will be processed.',
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => o.userId !== undefined && o.userId !== null)
  @IsArray({ message: 'userId must be an array' })
  @ArrayNotEmpty({ message: 'userId array cannot be empty if provided' })
  @IsUUID('4', { each: true, message: 'Each userId must be a valid UUID' })
  userId?: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

