import { IsString, IsObject, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateTenantConfigDto {
  @ApiProperty({ description: 'Configuration data as JSON object' })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional({ description: 'Version number', default: 1 })
  @IsOptional()
  @IsNumber()
  version?: number;

  @ApiPropertyOptional({ description: 'Expiration date' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateTenantConfigDto extends PartialType(CreateTenantConfigDto) {}

export class TenantConfigResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  context: string;

  @ApiProperty()
  config: Record<string, any>;

  @ApiProperty()
  version: number;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TenantConfigsResponseDto {
  @ApiProperty({ type: [TenantConfigResponseDto] })
  configs: TenantConfigResponseDto[];

  @ApiProperty()
  totalCount: number;
} 