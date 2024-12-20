import { ApiProperty } from "@nestjs/swagger";
import {
    IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  validateSync,
} from "class-validator";
import { BadRequestException } from "@nestjs/common";
import { Tenant } from "../entities/tenent.entity";
import { getMetadataArgsStorage } from "typeorm";
import { Expose } from "class-transformer";

export class TenantSearchDto {
  @ApiProperty({
    type: Number,
    description: "Limit",
    minimum: 1,
    maximum: 100,
  })
  @IsNumber()
  @Min(1)
  @Max(200)
  limit: number;

  @ApiProperty({
    type: Number,
    description: "Offset",
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(200)
  offset: number;

  @ApiProperty({
    type: Object,
    description: "The customFieldsName of the cohort",
  })
  @Expose()
  @IsOptional()
  @IsObject()
  @IsNotEmpty({ each: true })
  filters?: {};



}
