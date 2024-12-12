import { IsMobilePhone, IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDTO {
    @IsString({ message: 'Mobile number must be a string.' })
    @IsMobilePhone(null, { message: 'Invalid mobile phone number format.' })
    @Matches(/^\d{10}$/, { message: 'Mobile number must be exactly 10 digits.' })
    mobile: string;

    @IsString({ message: 'OTP must be a string.' })
    @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits.' })
    otp: string;

    @IsString({ message: 'Hash must be a string.' })
    @Length(10, 256, { message: 'Hash must be between 10 and 256 characters long.' })
    hash: string;
}

// @IsString()
// reason: string;