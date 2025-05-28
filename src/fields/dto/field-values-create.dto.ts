import { Exclude, Expose } from "class-transformer";
import { IsOptional, IsString, IsNumber, IsDate, IsBoolean } from 'class-validator';

/**
 * DTO for creating field values with type-specific storage
 */
export class FieldValuesCreateDto {
  //fieldId
  @Expose()
  fieldId: string;

  //value - stores original value
  @Expose()
  value: string;

  //type-specific value fields
  @Expose()
  @IsOptional()
  @IsString()
  textValue?: string;

  @Expose()
  @IsOptional()
  @IsNumber()
  numberValue?: number;

  @Expose()
  @IsOptional()
  @IsDate()
  calendarValue?: Date;

  @Expose()
  @IsOptional()
  dropdownValue?: any;

  @Expose()
  @IsOptional()
  @IsString()
  radioValue?: string;

  @Expose()
  @IsOptional()
  @IsBoolean()
  checkboxValue?: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  textareaValue?: string;

  @Expose()
  @IsOptional()
  @IsString()
  fileValue?: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
