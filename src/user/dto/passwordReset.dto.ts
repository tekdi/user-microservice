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
    userName: string;

    @IsString()
    @IsNotEmpty()
    newPassword: string;
}


export class ForgotPasswordDto {

    @IsString()
    @IsNotEmpty()
    newPassword: string;

    @IsString()
    @IsNotEmpty()
    token: string;
}