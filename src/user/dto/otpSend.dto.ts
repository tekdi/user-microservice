import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMobilePhone, IsOptional, IsString, Matches } from 'class-validator';

export class OtpSendDTO {

    @ApiProperty()
    @IsString({ message: 'Mobile number must be a string.' })
    @IsMobilePhone(null)
    @Matches(/^\d{10}$/, { message: 'Mobile number must be exactly 10 digits.' })
    mobile: string;

    @ApiProperty()
    @IsString({ message: 'Reason must be a string.' })
    @IsIn(['signup','login','forgot'], { message: 'Reason must be "signup,login or forgot".' })
    reason: string


      @ApiPropertyOptional({
        type: String,
        description:
          "reCAPTCHA token obtained on the client. Required unless CAPTCHA_ENABLED=false on the server.",
      })
      @IsOptional()
      @IsString({ message: "captchaToken must be a string" })
      captchaToken?: string;
    
}