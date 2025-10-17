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
import { TenantStatus } from "../entities/tenent.entity";

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
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Status of the tenant",
    enum: TenantStatus,
    isArray: true,
    default: [TenantStatus.ACTIVE],
  })
  @IsArray()
  @IsOptional()
  @ArrayNotEmpty() // Ensures the array is not empty (if provided)
  @IsIn([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.ARCHIVED], { each: true }) // Validates each array element
  @IsNotEmpty({ each: true }) // Ensures no empty strings in the array
  @Expose()
  status?: TenantStatus[];

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
    maximum: 200,
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
    maximum: 200,
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
