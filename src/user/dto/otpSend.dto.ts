import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMobilePhone, IsString, Matches, ValidateIf } from 'class-validator';

export class OtpSendDTO {

    // Required unless a WhatsApp number is given
    @ApiPropertyOptional({ description: 'Mobile number for SMS OTP', example: '9876543210' })
    @ValidateIf(o => !o.whatsapp || o.mobile !== undefined)
    @IsString({ message: 'Mobile number must be a string.' })
    @IsMobilePhone(null, { message: 'Invalid mobile phone number format.' })
    @Matches(/^\d{10}$/, { message: 'Mobile number must be exactly 10 digits.' })
    mobile?: string;

    // When set, the OTP goes out on WhatsApp, falling back to SMS on the same number
    @ApiPropertyOptional({ description: 'WhatsApp number for WhatsApp OTP (falls back to SMS)', example: '9876543210' })
    @ValidateIf(o => o.whatsapp !== undefined)
    @IsString({ message: 'WhatsApp number must be a string.' })
    @Matches(/^\d{10}$/, { message: 'WhatsApp number must be exactly 10 digits.' })
    whatsapp?: string;

    @IsString({ message: 'Reason must be a string.' })
    @IsIn(['signup'], { message: 'Reason must be "signup".' })
    reason: string
}
