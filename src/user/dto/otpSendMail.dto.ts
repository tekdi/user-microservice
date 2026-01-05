import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class OtpSendMailDTO {
  @ApiProperty()
  @IsEmail({}, { message: "Email must be a valid email address." })
  email: string;

  @ApiProperty()
  @IsString({ message: "Reason must be a string." })
  @IsIn(["signup", "login", "forgot"], {
    message: 'Reason must be "signup", "login", or "forgot".',
  })
  reason: string;

  @ApiProperty()
  @IsString({ message: "Key must be a string." })
  key: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: "First name must be a string." })
  firstName?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject({ message: "Replacements must be an object." })
  replacements?: Record<string, string>;
}
