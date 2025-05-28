import { Exclude, Expose } from "class-transformer";
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
  IsOptional,
  IsDate,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * DTO for updating field values with type-specific storage
 */
export class FieldValuesUpdateDto {
  //fieldValuesId
  @ApiProperty({
    type: String,
    description: "The fieldValuesId of the field values",
    default: "",
  })
  @Expose()
  fieldValuesId: string;

  //value - stores original value
  @ApiProperty({
    type: String,
    description: "The original value of the field values",
    default: "",
  })
  @Expose()
  value: string;

  //type-specific value fields
  @ApiPropertyOptional({
    type: String,
    description: "The text value for text type fields",
  })
  @Expose()
  @IsOptional()
  @IsString()
  textValue?: string;

  @ApiPropertyOptional({
    type: Number,
    description: "The numeric value for number type fields",
  })
  @Expose()
  @IsOptional()
  @IsNumber()
  numberValue?: number;

  @ApiPropertyOptional({
    type: Date,
    description: "The date value for calendar type fields",
  })
  @Expose()
  @IsOptional()
  @IsDate()
  calendarValue?: Date;

  @ApiPropertyOptional({
    type: 'string | number | boolean',
    description: "The JSON value for dropdown type fields",
  })
  @Expose()
  @IsOptional()
  dropdownValue?: string | number | boolean | { [key: string]: any };

  @ApiPropertyOptional({
    type: String,
    description: "The string value for radio type fields",
  })
  @Expose()
  @IsOptional()
  @IsString()
  radioValue?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "The boolean value for checkbox type fields",
  })
  @Expose()
  @IsOptional()
  @IsBoolean()
  checkboxValue?: boolean;

  @ApiPropertyOptional({
    type: String,
    description: "The text value for textarea type fields",
  })
  @Expose()
  @IsOptional()
  @IsString()
  textareaValue?: string;

  @ApiPropertyOptional({
    type: String,
    description: "The file path/URL for file type fields",
  })
  @Expose()
  @IsOptional()
  @IsString()
  fileValue?: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
