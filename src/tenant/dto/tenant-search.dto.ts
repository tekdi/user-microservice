import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Expose } from "class-transformer";

export class TenantFilters {
  @ApiPropertyOptional({ type: () => String, description: 'Tenant Id must be a (UUID)' })
  @IsString()
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Status of the tenant",
    enum: ['published', 'draft', 'archived'],
    isArray: true,
    default: ['published'],
  })
  @IsArray()
  @IsOptional()
  @ArrayNotEmpty() // Ensures the array is not empty (if provided)
  @IsIn(['published', 'draft', 'archived'], { each: true }) // Validates each array element
  @IsNotEmpty({ each: true }) // Ensures no empty strings in the array
  @Expose()
  status?: ('published' | 'draft' | 'archived')[];

  @ApiPropertyOptional({ type: () => String, description: 'The ID of the creator (UUID)' })
  @IsString()
  @IsUUID()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({ type: () => String, description: 'The ID of the updater (UUID)' })
  @IsString()
  @IsUUID()
  @IsOptional()
  updatedBy?: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  programHead?: string;
}

export class TenantSearchDTO {
  @ApiProperty({
    type: Number,
    description: "Limit",
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(200)
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Offset",
    minimum: 0,
    maximum: 100,
    default: 0,
  })
  @IsNumber()
  @Min(0)
  @Max(200)
  offset: number;

  @ApiPropertyOptional({ type: () => TenantFilters })
  @IsOptional()
  @IsObject()
  @IsNotEmpty({ each: true })
  filters?: TenantFilters;
}
