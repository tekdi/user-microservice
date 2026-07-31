import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
} from "class-validator";

export class UserAnonymizeDto {
  @ApiProperty({
    type: [String],
    description:
      "Email addresses of the users to anonymize (GDPR-style erasure). Up to 100 per request.",
    example: ["user1@example.com", "user2@example.com"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((email) =>
          typeof email === "string" ? email.trim().toLowerCase() : email
        )
      : value
  )
  emails: string[];

  @ApiProperty({
    description:
      "Reason this anonymization was requested, stored on the user record.",
    example: "GDPR erasure request",
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
