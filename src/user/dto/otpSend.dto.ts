import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
 IsEmail,
 IsIn,
 IsMobilePhone,
 IsObject,
 IsOptional,
 IsString,
 Matches,
 ValidateIf,
} from "class-validator";


export class OtpSendDTO {
 @ApiPropertyOptional()
 @ValidateIf((o) => o.mobile !== undefined && o.mobile !== "")
 @IsString({ message: "Mobile number must be a string." })
 @IsMobilePhone(null, { message: "Invalid mobile phone number format." })
 @Matches(/^\d{10}$/, { message: "Mobile number must be exactly 10 digits." })
 mobile?: string;


 @ApiProperty()
 @IsString({ message: "Reason must be a string." })
 @IsIn(["signup", "login", "forgot"], {
   message: 'Reason must be "signup,login or forgot".',
 })
 reason: string;


 @ApiPropertyOptional()
 @IsOptional()
 @IsEmail()
 email?: string;


 @ApiPropertyOptional()
 @IsOptional()
 @IsString()
 firstName?: string;


 @ApiPropertyOptional()
 @IsOptional()
 @IsString()
 key?: string;


 @ApiPropertyOptional()
 @IsOptional()
 @IsString()
 whatsapp?: string;


 @ApiPropertyOptional({
   type: "object",
   description: "Key-value pairs for dynamic replacements in templates",
 })
 @IsOptional()
 @IsObject()
 replacements?: Record<string, string | number>;
}