import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class FieldValueDto {
  @ApiProperty({
    type: String,
    description: "fieldId",
  })
  fieldId: string;
  @ApiProperty({
    type: String,
    description: "itemId",
  })
  itemId: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

export class FieldValuesDeleteDto {
  @Expose()
  fieldValues: FieldValueDto[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
