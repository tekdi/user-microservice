import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsString,
  Length,
  Matches,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

// Custom validator function
function IsValidOtp(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: "isValidOtp",
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const otpDigits = process.env.OTP_DIGITS
            ? Number.parseInt(process.env.OTP_DIGITS)
            : 6;
          const regex = new RegExp(`^\\d{${otpDigits}}$`);
          return typeof value === "string" && regex.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          const otpDigits = process.env.OTP_DIGITS
            ? Number.parseInt(process.env.OTP_DIGITS)
            : 6;
          return `OTP must be exactly ${otpDigits} digits.`;
        },
      },
    });
  };
}

export class OtpVerifyDTO {
  @ApiProperty()
  @ValidateIf((o) => o.reason === "signup")
  @IsString({ message: "Mobile number must be a string." })
  @Matches(/^\d{10}$/, { message: "Mobile number must be exactly 10 digits." })
  mobile: string;

  @ApiProperty()
  @IsString({ message: "OTP must be a string." })
  @IsValidOtp() // Use the custom validator
  otp: string;

  @ApiProperty()
  @IsString({ message: "Hash must be a string." })
  @Length(10, 256, {
    message: "Hash must be between 10 and 256 characters long.",
  })
  hash: string;

  @ApiProperty()
  @IsString({ message: "Reason must be a string." })
  @IsIn(["signup", "forgot"], {
    message: 'Reason must be either "signup" or "forgot".',
  })
  reason: string;

  @ApiProperty()
  @ValidateIf((o) => o.reason === "forgot")
  @IsString({ message: "Username must be a string." })
  username: string;
}
