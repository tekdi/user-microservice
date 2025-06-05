import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';
import { UserCreateDto } from './user-create.dto';

export class UserCreateSsoDto extends OmitType(UserCreateDto, [
  'password',
] as const) {
  // Make password optional or remove validation for SSO
  @ApiPropertyOptional({
    type: String,
    description: 'The password of the user (optional for SSO)',
  })
  @IsOptional()
  @Expose()
  password?: string;

  @ApiProperty({
    type: String,
    description: 'Provider of the user',
    enum: ['google', 'microsoft', 'instagram', 'facebook', 'github'],
  })
  @IsNotEmpty()
  @IsEnum(['google', 'microsoft', 'instagram', 'facebook', 'github'])
  @Expose()
  provider: string;

  // You can add or override other SSO-specific fields here if needed

  // Constructor to support partial assignment
  constructor(partial: Partial<UserCreateSsoDto>) {
    super(partial); // Call the parent class constructor
    Object.assign(this, partial);
  }
}
