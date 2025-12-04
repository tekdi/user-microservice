import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsMobilePhone, IsString, Matches } from "class-validator";

export class OtpSendDTO {
  @ApiProperty()
  @IsString({ message: "Mobile number must be a string." })
  @IsMobilePhone(null, { message: "Invalid mobile phone number format." })
  @Matches(/^\d{10}$/, { message: "Mobile number must be exactly 10 digits." })
  mobile: string;

  @ApiProperty()
  @IsString({ message: "Reason must be a string." })
  @IsIn(["signup", "login", "forgot"], {
    message: 'Reason must be "signup,login or forgot".',
  })
  reason: string;
}
