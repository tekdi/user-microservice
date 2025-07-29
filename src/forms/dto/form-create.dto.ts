import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsNotEmptyObject,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FormCreateDto {
  tenantId: string;

  @ApiProperty({
    type: String,
    description: "title",
    example: "Sample Form",
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    type: String,
    description: "context",
    example: "Context",
  })
  @IsString()
  @IsNotEmpty()
  context: string;

  @ApiProperty({
    type: String,
    description: "context",
    example: "Context",
  })
  @IsString()
  @IsNotEmpty()
  contextType: string;

  @ApiProperty({
    description: "fields",
  })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  fields?: any;

  createdBy: string;

  updatedBy: string;
}
