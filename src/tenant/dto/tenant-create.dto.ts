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
    @ApiProperty({
        type: String,
        description: "Tenant name",
        default: "",
    })
    @IsString()
    @IsNotEmpty()
    @Expose()
    name: string;

    //domain
    @ApiPropertyOptional({
        type: String,
        description: "Domain Name",
        default: "",
    })
    @Expose()
    domain?: string;

    //params
    @ApiPropertyOptional({
        type: Object,
        description: "Params",
        default: "",
    })
    @Expose()
    params: object;

    //file path
    @ApiPropertyOptional({
        description: 'List of program images (URLs or other related strings)',
    })
    @Expose()
    programImages: string[];

    @ApiProperty({ type: String })
    @IsString()
    @IsNotEmpty()
    @Expose()
    description?: string;

    @ApiProperty({ type: String })
    @IsString()
    @IsNotEmpty()
    @Expose()
    programHead?: string

    constructor(obj?: Partial<TenantCreateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
