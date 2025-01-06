import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
  ValidateIf,
  IsDate,
} from "class-validator";
import { Expose, Type } from "class-transformer";
import { UserStatus } from "../entities/user-entity";
import { ApiPropertyOptional } from "@nestjs/swagger";

class UserDataDTO {
  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  userId: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  username: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  name: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  role: string;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  dob: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  email: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  district: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  state: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  address: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsOptional()
  @IsString()
  pincode: string | null;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  createdAt: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  updatedAt: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  createdBy: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  updatedBy: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  tenantId: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  reason: string;

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  deviceId: string;
}
class CustomFieldDTO {
  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @Expose()
  @IsNotEmpty()
  fieldId: string;

  @ApiPropertyOptional({ type: () => String })
  @ValidateIf((o) => o.value !== "")
  @IsNotEmpty()
  @Expose()
  value: string | string[];
}

export class UserUpdateDTO {
  userId: string;

  @ApiPropertyOptional({ type: () => [UserDataDTO] })
  @Expose()
  @ValidateNested()
  @IsNotEmpty()
  @Type(() => UserDataDTO)
  userData: UserDataDTO;

  @ApiPropertyOptional({ type: () => [CustomFieldDTO] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDTO)
  @Expose()
  customFields: CustomFieldDTO[];
}
