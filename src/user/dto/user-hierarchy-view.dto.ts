import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class UserHierarchyViewDto {
  @ApiProperty({
    type: String,
    description: "Email address of the user",
    example: "user@example.com",
    required: true,
  })
  @Expose()
  @IsNotEmpty({ message: "Email is required" })
  @IsString({ message: "Email must be a string" })
  @IsEmail({}, { message: "Please provide a valid email address" })
  email: string;
}

