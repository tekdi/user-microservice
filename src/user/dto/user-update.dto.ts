import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  ValidateIf,
  Length,
  IsDate,
} from "class-validator";
import { Expose, Type } from "class-transformer";
import { UserStatus } from "../entities/user-entity";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {AutomaticMemberDto} from "src/user/dto/user-create.dto";

export enum ActionType {
  ADD = 'add',
  REMOVE = 'remove',
}

class UserDataDTO {
  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  username: string;

  @ApiProperty({ type: String, description: 'First name of the user', maxLength: 50 })
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 50)
  firstName?: string;

  @ApiProperty({ type: String, description: 'Middle name of the user (optional)', maxLength: 50, required: false })
  @Expose()
  @IsOptional()
  @IsString()
  @Length(0, 50)
  middleName?: string;

  @ApiProperty({ type: String, description: 'Last name of the user', maxLength: 50 })
  @Expose()
  @IsOptional()
  @IsString()
  @Length(1, 50)
 	lastName?: string;


  @ApiProperty({
    type: String,
    description: 'Gender of the user',
    enum: ['male', 'female', 'transgender']
  })
  @Expose()
  @IsEnum(['male', 'female', 'transgender'])
  @IsOptional()
  gender?: string;
 
	@ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  name: string;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  role: string;

  @ApiProperty({ type: () => String, format: 'date-time', example: '1990-01-01' })
  @IsOptional()
  @Type(() => Date) // Ensures validation correctly parses strings into Date objects
  @IsDate()
  dob: Date | null;

  @ApiProperty({ type: () => String })
  @IsOptional()
  @IsString()
  email: string | null;

  @ApiProperty({ type: () => String })
  @IsOptional()
  @IsString()
  district: string | null;

  @ApiProperty({ type: () => String })
  @IsOptional()
  @IsString()
  state: string | null;

  @ApiProperty({ type: () => String })
  @IsOptional()
  @IsString()
  address: string | null;

  @ApiProperty({ type: () => String })
  @IsOptional()
  @IsString()
  pincode: string | null;

  @ApiProperty({ type: () => Date, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAt: Date;

  @ApiProperty({ type: () => Date, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  updatedAt: Date;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  createdBy: string;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  updatedBy: string;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  tenantId: string;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  reason: string;

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.action)
  @IsNotEmpty({ message: 'deviceId is required when action is provided' })
  deviceId: string;

  @ApiProperty({ enum: ActionType, required: false })
  @ValidateIf((o) => o.deviceId)
  @IsEnum(ActionType, { message: `Action must be either ${Object.values(ActionType).join(' or ')}` }) // Restrict to "add" or "remove"
  action: ActionType;
}
class CustomFieldDTO {
  @ApiProperty({ type: () => String })
  @IsString()
  @Expose()
  @IsNotEmpty()
  fieldId: string;

  @ApiProperty({ type: () => String })
  @ValidateIf((o) => o.value !== "")
  @IsNotEmpty()
  @Expose()
  value: string | string[];
}


export class UserUpdateDTO {
  userId: string;

  @ApiProperty({ type: () => [UserDataDTO] })
  @Expose()
  @ValidateNested()
  @IsNotEmpty()
  @Type(() => UserDataDTO)
  userData: UserDataDTO;

  @ApiPropertyOptional({ type: () => AutomaticMemberDto, description: 'Details of automatic membership' })
  @Expose()
  automaticMember?: AutomaticMemberDto;

  @ApiProperty({ type: () => [CustomFieldDTO] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDTO)
  @Expose()
  customFields: CustomFieldDTO[];
}
