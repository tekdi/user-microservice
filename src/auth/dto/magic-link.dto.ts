import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsIn, IsUrl, IsNotEmpty } from 'class-validator';

export class RequestMagicLinkDto {
  @ApiProperty({
    description: 'User identifier (email, phone, or username)',
    example: 'user@example.com'
  })
  @IsNotEmpty({ message: 'Identifier is required.' })
  identifier: string;

  @ApiProperty({
    description: 'Redirect URL after successful authentication',
    example: 'https://app.example.com/dashboard',
    required: false
  })
  @IsOptional()
  @IsUrl()
  redirectUrl?: string;

  @ApiProperty({
    description: 'Notification channel for sending magic link',
    enum: ['email', 'sms', 'whatsapp'],
    example: 'email'
  })
  @IsNotEmpty({ message: 'Notification channel is required.' })
  @IsIn(['email', 'sms', 'whatsapp'], { message: 'Notification channel must be one of: email, sms, whatsapp.' })
  notificationChannel: 'email' | 'sms' | 'whatsapp';
}

export class MagicLinkResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'If the identifier is valid, you will receive a magic link'
  })
  message: string;
}

export class MagicLinkValidationDto {
  @ApiProperty({
    description: 'Magic link token',
    example: 'abc123def456ghi7'
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'Encoded redirect URL',
    example: 'https%3A//frontend.com/auth/success',
    required: false
  })
  @IsOptional()
  @IsString()
  redirect?: string;
} 