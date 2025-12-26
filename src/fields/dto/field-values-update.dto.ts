import { Exclude, Expose } from "class-transformer";
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FieldValuesUpdateDto {
  //fieldValuesId
  @ApiProperty({
    type: String,
    description: "The fieldValuesId of the field values",
    default: "",
  })
  @Expose()
  fieldValuesId: string;

  //value
  @ApiProperty({
    type: [String],
    description: "The value of the field values (can be string or array of strings)",
    default: "",
  })
  @Expose()
  value: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
    // Normalize value: convert string to array, keep array as is
    const originalValue = obj?.value;
    if (originalValue !== undefined && originalValue !== null && originalValue !== "") {
      this.value = Array.isArray(originalValue) ? originalValue : [originalValue];
    }
  }
}
