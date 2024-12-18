import { Exclude, Expose } from "class-transformer";

export class FieldValuesCreateDto {
  //fieldId
  @Expose()
  fieldId: string;

  //value
  @Expose()
  value: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
