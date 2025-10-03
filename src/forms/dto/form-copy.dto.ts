import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FormCopyDto {
  @ApiProperty({
    type: String,
    description: 'ID of the form to copy',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID(undefined, { message: 'Form ID must be a valid UUID' })
  formId: string;

  @ApiProperty({
    type: String,
    description: 'ID of the target cohort where the form will be copied',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID(undefined, { message: 'Cohort ID must be a valid UUID' })
  cohortId: string;

  @ApiProperty({
    type: String,
    description: 'Tenant ID for the copied form',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsUUID(undefined, { message: 'Tenant ID must be a valid UUID' })
  tenantId?: string;
}
