import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class SsoRequestDto {
  @ApiProperty({
    type: String,
    description: 'Access token from the SSO provider',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  accessToken: string;

  @ApiProperty({
    type: String,
    description: 'User ID from the SSO provider',
    example: 'user123'
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  userId: string;


  @ApiProperty({
    type: String,
    description: 'Tenant ID for multi-tenant applications',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    type: String,
    description: 'Role ID for the user',
    example: '550e8400-e29b-41d4-a716-446655440001'
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Roles (populated internally from roleId)',
    example: 'admin'
  })
  @Expose()
  @IsOptional()
  @IsString()
  roles?: string;

  @ApiProperty({
    type: String,
    description: 'SSO provider identifier (e.g., newton, google, microsoft)',
    example: 'newton'
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  ssoProvider: string;

  constructor(partial: Partial<SsoRequestDto>) {
    Object.assign(this, partial);
  }
} 