import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

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

export class RegisterForBoardEnrolmentDto {
  @IsString()
  @IsNotEmpty()
  cohortMembershipId: string;

  @ApiProperty({ type: () => [CustomFieldDTO] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDTO)
  @Expose()
  customFields: CustomFieldDTO[];
}
