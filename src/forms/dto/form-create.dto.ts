import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsNotEmptyObject,
  IsUUID,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FormCreateDto {
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
  @IsOptional()
  context: string;

  @ApiProperty({
    type: String,
    description: 'context',
    example: 'Context',
  })
  @IsString()
  @IsOptional()
  contextType: string;

  @ApiProperty({
    type: String,
    description: 'Tenant ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  tenantId: string;

  @ApiProperty({
    description: 'fields',
  })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  fields?: any;

  createdBy: string;

  updatedBy: string;

}
