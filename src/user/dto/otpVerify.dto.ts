import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class OtpVerifyDTO {

    @ValidateIf(o => o.reason === 'signup') // Only validate if reason is 'signup'
    @IsString({ message: 'Mobile number must be a string.' })
    @Matches(/^\d{10}$/, { message: 'Mobile number must be exactly 10 digits.' })
    mobile: string;

    @IsString({ message: 'OTP must be a string.' })
    @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits.' })
    otp: string;

    @IsString({ message: 'Hash must be a string.' })
    @Length(10, 256, { message: 'Hash must be between 10 and 256 characters long.' })
    hash: string;

    @IsString({ message: 'Reason must be a string.' })
    @IsIn(['signup', 'forgot'], { message: 'Reason must be either "signup" or "forgot".' })
    reason: string

    @ValidateIf(o => o.reason === 'forgot') // Only validate if reason is 'forgot'
    @IsString({ message: 'Username must be a string.' })
    username: string;
}
