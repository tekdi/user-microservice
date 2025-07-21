// import { IsUUID,IsObject, IsBoolean, IsOptional } from 'class-validator';

import { Expose, Type } from "class-transformer";
import {
  IsBoolean,
  IsUUID,
  IsObject,
  IsOptional,
  IsString,
  IsArray,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PrimaryGeneratedColumn } from "typeorm";

class ConditionDto {
  @ApiProperty({ type: String, description: "The value for the condition" })
  @Expose()
  @IsString()
  value: string;

  @ApiProperty({ type: String, description: "The field ID for the condition" })
  @Expose()
  @IsUUID(undefined, { message: "Field ID must be a valid UUID" })
  fieldId: string;

  @ApiPropertyOptional({
    type: String,
    description: "The operator for the condition (e.g., '=', '!=')",
  })
  @Expose()
  @IsString()
  operator?: string;
}

class AllowedActionsDto {
  @ApiPropertyOptional({
    type: [String],
    description: "Allowed actions for users",
  })
  @Expose()
  @IsArray()
  user?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Allowed actions for cohorts",
  })
  @Expose()
  @IsArray()
  cohort?: string[];
}

export class RulesDto {
  @ApiProperty({ type: () => ConditionDto, description: "Condition details" })
  @Expose()
  @IsObject()
  @Type(() => ConditionDto)
  condition: ConditionDto;

  @ApiProperty({ type: String, description: "Cohort field name" })
  @Expose()
  @IsString()
  cohortField: string;

  @ApiPropertyOptional({
    type: () => AllowedActionsDto,
    description: "Allowed actions for user and cohort",
  })
  @Expose()
  @IsObject()
  @Type(() => AllowedActionsDto)
  allowedActions?: AllowedActionsDto;
}

export class CreateAutomaticMemberDto {
  @ApiProperty({ type: String, description: "User ID" })
  @Expose()
  @IsUUID(undefined, { message: "User ID must be a valid UUID" })
  userId: string;

  @ApiProperty({ type: () => RulesDto, description: "Rules configuration" })
  @Expose()
  @IsObject()
  @Type(() => RulesDto)
  rules: RulesDto;

  @ApiProperty({ type: String, description: "Tenant ID" })
  @Expose()
  @IsUUID(undefined, { message: "Tenant ID must be a valid UUID" })
  tenantId: string;

  @ApiProperty({ type: Boolean, description: "Status of the rule" })
  @Expose()
  @IsBoolean()
  isActive: boolean;
}

// export class CreateAutomaticMemberDto {
//   @IsUUID()
//   userId: string;

//   @IsObject()
//   rules: any;

//   @IsUUID()
//   tenantId: string;

//   @IsBoolean()
//   @IsOptional()
//   isActive?: boolean;
// }
