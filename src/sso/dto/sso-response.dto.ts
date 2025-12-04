import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class SsoUserDataDto {
  @ApiProperty({ type: String, description: "User ID" })
  @Expose()
  userId: string;

  @ApiProperty({ type: String, description: "Username" })
  @Expose()
  username: string;

  @ApiProperty({ type: String, description: "First name" })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ type: String, description: "Middle name" })
  @Expose()
  middleName?: string;

  @ApiProperty({ type: String, description: "Last name" })
  @Expose()
  lastName: string;

  @ApiProperty({ type: String, description: "Email" })
  @Expose()
  email: string;

  @ApiPropertyOptional({ type: String, description: "Mobile number" })
  @Expose()
  mobile?: string;

  @ApiPropertyOptional({ type: String, description: "Gender" })
  @Expose()
  gender?: string;

  @ApiPropertyOptional({ type: String, description: "Date of birth" })
  @Expose()
  dob?: string;

  @ApiPropertyOptional({ type: String, description: "District" })
  @Expose()
  district?: string;

  @ApiPropertyOptional({ type: String, description: "State" })
  @Expose()
  state?: string;

  @ApiPropertyOptional({ type: String, description: "Address" })
  @Expose()
  address?: string;

  @ApiPropertyOptional({ type: String, description: "Pincode" })
  @Expose()
  pincode?: string;
}

export class SsoResponseDto {
  @ApiProperty({ type: String, description: "Status of the operation" })
  @Expose()
  status: "success" | "existing_user" | "new_user_created";

  @ApiProperty({ type: String, description: "Message describing the result" })
  @Expose()
  message: string;

  @ApiProperty({
    type: Boolean,
    description: "Whether user is new or existing",
  })
  @Expose()
  isNewUser: boolean;

  @ApiPropertyOptional({ type: SsoUserDataDto, description: "User data" })
  @Expose()
  userData?: SsoUserDataDto;

  @ApiPropertyOptional({
    type: String,
    description: "Access token for new users",
  })
  @Expose()
  accessToken?: string;

  @ApiPropertyOptional({
    type: String,
    description: "Refresh token for new users",
  })
  @Expose()
  refreshToken?: string;

  @ApiPropertyOptional({ type: String, description: "SSO provider used" })
  @Expose()
  ssoProvider?: string;

  @ApiProperty({ type: Date, description: "Timestamp of the operation" })
  @Expose()
  timestamp: Date;
}
