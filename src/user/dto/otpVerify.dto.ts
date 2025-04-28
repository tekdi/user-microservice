import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { otpConfig } from './configotp-digit';

// Always parse env variable properly
// const otpDigits = (process.env.OTP_DIGITS); // fallback to 6 if not set
// const otpRegex = new RegExp(`^\\d{${otpDigits}}$`);
// console.log('OTP_DIGITS ===>', process.env.OTP_DIGITS);
// console.log(otpConfig.otpDigits); // prints 4 (or whatever you set in .env)

export class OtpVerifyDTO {

    @ApiProperty()
    @ValidateIf(o => o.reason === 'signup') // Only validate if reason is 'signup'
    @IsString({ message: 'Mobile number must be a string.' })
    @Matches(/^\d{10}$/, { message: 'Mobile number must be exactly 10 digits.' })
    mobile: string;

    @ApiProperty()
    @IsString({ message: 'OTP must be a string.' })
    @Matches(otpConfig.getOtpRegex(), { message: `OTP must be exactly ${otpConfig.getOtpDigits()} digits.` })
    otp: string;

    @ApiProperty()
    @IsString({ message: 'Hash must be a string.' })
    @Length(10, 256, { message: 'Hash must be between 10 and 256 characters long.' })
    hash: string;

    @ApiProperty()
    @IsString({ message: 'Reason must be a string.' })
    @IsIn(['signup', 'forgot'], { message: 'Reason must be either "signup" or "forgot".' })
    reason: string

    @ApiProperty()
    @ValidateIf(o => o.reason === 'forgot') // Only validate if reason is 'forgot'
    @IsString({ message: 'Username must be a string.' })
    username: string;
}
