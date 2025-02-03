import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";

export class FieldValueDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    type: String,
    description: "fieldId",
  })
  @IsNotEmpty()
  @IsString()
  fieldId: string;
  @ApiProperty({
    type: String,
    description: "itemId",
  })
  itemId: string;

  constructor(obj: Partial<FieldValuesDeleteDto>) {
    Object.assign(this, obj);
  }
}

export class FieldValuesDeleteDto {
  @ApiProperty({
    type: [FieldValueDto],
    description: "Array of field values to delete",
    required: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FieldValueDto)
  fieldValues: FieldValueDto[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
