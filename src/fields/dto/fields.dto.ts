import { Exclude, Expose } from "class-transformer";
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
  IsEnum,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FieldType } from "../entities/fields.entity";
export class FieldsDto {
  //generated fields
  @Expose()
  fieldId: string;

  //name
  @ApiProperty({
    type: String,
    description: "The name of the fields",
    default: "",
  })
  @Expose()
  name: string;

  //label
  @ApiProperty({
    type: String,
    description: "The label of the fields",
    default: "",
  })
  @Expose()
  label: string;

  //context
  @ApiPropertyOptional({
    type: String,
    description: "The context of the fields",
    default: "",
  })
  @Expose()
  context: string;

  //contextType
  @ApiPropertyOptional({
    type: String,
    description: "The contextType of the fields",
    default: "",
  })
  @Expose()
  contextType: string;

  //type
  @ApiProperty({
    enum: FieldType,
    default: FieldType.TEXT,
    nullable: false
  })
  @IsEnum(FieldType)
  @Expose()
  type: string;

  //ordering
  @ApiProperty({
    type: Number,
    description: "The ordering of the fields",
    default: 0,
  })
  @Expose()
  ordering: Number;


  //tenantId
  @ApiPropertyOptional({
    type: String,
    description: "The tenantId of the fields",
    default: "",
  })
  @Expose()
  tenantId: string;

  // fieldParams
  @ApiPropertyOptional({
    type: Object,
    description: "The fieldParams of the fields",
    default: {},
  })
  @Expose()
  fieldParams: object;

  //fieldAttributes
  @ApiPropertyOptional({
    type: Object,
    description: "The fieldAttributes of the fields",
    default: {},
  })
  @Expose()
  fieldAttributes: object;

  //sourceDetails
  @ApiPropertyOptional({
    type: Object,
    description: "The sourceDetails of the fields",
    default: {},
  })
  @Expose()
  sourceDetails: object;

  //dependsOn
  @ApiPropertyOptional({
    type: String,
    description: "The dependsOn of the fields",
    default: {},
  })
  @Expose()
  dependsOn: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}