import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class TenantCreateDto {

    @Expose()
    tenantId: string;

    @Expose()
    createdAt: string;

    @Expose()
    updatedAt: string;

    @Expose()
    createdBy: string;

    @Expose()
    updatedBy: string;

    //tenant name
    @ApiProperty({ type: () => String })
    @IsString()
    @IsNotEmpty()
    name: string;

    //domain
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    domain?: string;

    //params
    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    params?: object;

    //file path
    @ApiPropertyOptional({ type: () => [String] })
    @IsArray()
    @IsString({ each: true })    @IsOptional()
    programImages: string[];

    @ApiProperty({ type: () => String })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsNotEmpty()
    programHead: string;

    constructor(obj?: Partial<TenantCreateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
