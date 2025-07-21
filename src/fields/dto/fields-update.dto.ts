import { Exclude, Expose } from "class-transformer";
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsBoolean,
  IsObject,
  ValidateIf,
  IsDefined,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FieldType } from "../entities/fields.entity";
import { Type } from "class-transformer";

class FieldParams {
  @ApiPropertyOptional({
    type: Boolean,
    description: "Specifies if the field can be created",
    default: false,
  })
  @IsBoolean()
  @IsDefined() // Ensures this field is required
  isCreate: boolean;

  @ApiPropertyOptional({
    type: Array,
    description: "Options for the field",
    default: [],
  })
  @IsOptional()
  @IsObject({ each: true })
  options: { name: string; value: string }[];
}

export class FieldsUpdateDto {
  // Generated fields
  @Expose()
  fieldId: string;

  // Name
  @ApiPropertyOptional({
    type: String,
    description: "The name of the fields",
    default: "",
  })
  @Expose()
  name: string;

  // Label
  @ApiPropertyOptional({
    type: String,
    description: "The label of the fields",
    default: "",
  })
  @Expose()
  label: string;

  // Context
  @ApiPropertyOptional({
    type: String,
    description: "The context of the fields",
    default: "",
  })
  @Expose()
  context: string;

  // Context Type
  @ApiPropertyOptional({
    type: String,
    description: "The contextType of the fields",
    default: "",
  })
  @Expose()
  contextType: string;

  // Type
  @ApiPropertyOptional({
    enum: FieldType,
    default: FieldType.TEXT,
    nullable: false,
  })
  @IsEnum(FieldType, { message: "type must be a valid enum value" })
  @ValidateIf((o) => o.type !== undefined) // Validate only if type is defined
  @Expose()
  type: string;

  // Ordering
  @ApiPropertyOptional({
    type: Number,
    description: "The ordering of the fields",
    default: 0,
  })
  @Expose()
  ordering: number;

  // Required
  @ApiPropertyOptional({
    type: Boolean,
    description: "The required of the fields",
    default: true,
  })
  @Expose()
  required: boolean;

  // Tenant ID
  @ApiPropertyOptional({
    type: String,
    description: "The tenantId of the fields",
    default: "",
  })
  @Expose()
  tenantId: string;

  // FieldParams
  @ApiPropertyOptional({
    type: FieldParams,
    description: "The fieldParams of the fields",
    default: {},
  })
  @ValidateNested()
  @Type(() => FieldParams)
  @ValidateIf((o) => o.fieldParams !== undefined) // Validate only if fieldParams is present
  @Expose()
  fieldParams: FieldParams;

  // FieldAttributes
  @ApiPropertyOptional({
    type: Object,
    description: "The fieldAttributes of the fields",
    default: {},
  })
  @Expose()
  fieldAttributes: object;

  // SourceDetails
  @ApiPropertyOptional({
    type: Object,
    description: "The sourceDetails of the fields",
    default: {},
  })
  @Expose()
  sourceDetails: object;

  // DependsOn
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
