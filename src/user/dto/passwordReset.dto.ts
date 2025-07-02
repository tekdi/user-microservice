import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendPasswordResetLinkDto {

  @ApiProperty({ type: () => String, example: 'John' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ type: () => String, example: 'https://example.com' })
  @IsString()
  @IsNotEmpty()
  redirectUrl: string
}

export class ResetUserPasswordDto {
  @ApiProperty()
  userName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class ForgotPasswordDto {

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newPassword: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}


export class SendPasswordResetOTPDto {

  @ApiProperty({ type: () => String, example: 'John' })
  @IsString()
  @IsNotEmpty()
  username: string;
}
