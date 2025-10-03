import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsNotEmptyObject,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum FormStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  DRAFT = 'draft',
}
export class FormCreateDto {
  tenantId: string;

  @ApiProperty({
    type: String,
    description: 'title',
    example: 'Sample Form',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    type: String,
    description: 'context',
    example: 'Context',
  })
  @IsString()
  @IsNotEmpty()
  context: string;

  @ApiProperty({
    type: String,
    description: 'context',
    example: 'Context',
  })
  @IsString()
  @IsNotEmpty()
  contextType: string;

  @ApiProperty({
    description: 'fields',
  })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  fields?: any;

  createdBy: string;

  updatedBy: string;

  @ApiProperty({
    type: String,
    description: 'The UUID of the cohort (stored as contextId)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'Cohort ID (contextId) must be a valid UUID' })
  contextId: string;

  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @ApiProperty({
    description: 'fields',
  })
  @IsOptional()
  @IsObject()
  rules?: any;
}
