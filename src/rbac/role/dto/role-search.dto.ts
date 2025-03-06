import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsNumberString, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { TenantFilters } from "src/tenant/dto/tenant-search.dto";

export class RoleFilters {
  @ApiPropertyOptional({ type: () => String, description: 'Role Id must be a (UUID)' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ type: () => String, description: 'Tenant Id must be a valid UUID' })
  @ValidateIf((obj) => obj.tenantId !== undefined && obj.tenantId !== null && obj.tenantId !== "") // Prevent empty values
  @IsUUID("4", { message: "tenantId must be a valid UUID v4" }) // Enforce UUID format
  tenantId?: string;
}

export class RoleSearchDto {
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

  @ApiPropertyOptional({ type: () => RoleFilters })
  @IsOptional()
  @IsObject()
  @IsNotEmpty({ each: true })
  filters?: TenantFilters;
}