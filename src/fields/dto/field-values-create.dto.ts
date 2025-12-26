import { Exclude, Expose } from "class-transformer";

export class FieldValuesCreateDto {
  //fieldId
  @Expose()
  fieldId: string;

  //value
  @Expose()
  value: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
    // Normalize value: convert string to array, keep array as is
    if (this.value !== undefined && this.value !== null) {
      this.value = Array.isArray(this.value) ? this.value : [this.value];
    }
  }
}
