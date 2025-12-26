import { Exclude, Expose } from "class-transformer";
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FieldValuesDto {
  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  //fieldId
  @Expose()
  fieldId: string;

  //value
  @Expose()
  value: string[];

  //itemId
  @Expose()
  itemId: string;

  //createdBy
  @Expose()
  createdBy: string;

  //updatedBy
  @Expose()
  updatedBy: string;

  constructor(obj: any) {
    Object.assign(this, obj);
    // Normalize value: convert string to array, keep array as is
    if (this.value !== undefined && this.value !== null) {
      this.value = Array.isArray(this.value) ? this.value : [this.value];
    }
  }
}
