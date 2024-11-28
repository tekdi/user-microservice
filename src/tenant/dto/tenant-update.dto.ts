import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class TenantUpdateDto {
    //tenant name
    @ApiPropertyOptional({
        type: String,
        description: "Tenant name",
        default: "",
    })
    @IsString()
    @IsOptional()
    @Expose()
    name: string;

    //domain
    @ApiPropertyOptional({
        type: String,
        description: "Domain Name",
        default: "",
    })
    @IsString()
    @IsOptional()
    @Expose()
    domain: string;

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
        type: String,
    })
    @IsString()
    @IsOptional()
    @Expose()
    programImages: string[];


    @ApiPropertyOptional({ type: String })
    @IsString()
    @IsOptional()
    @Expose()
    description: string;


    //status
    @ApiPropertyOptional({
        type: String,
        description: "Status of the tenant",
        enum: ['active', 'inactive', 'archive'],
        default: 'active',
    })
    @IsString()
    @IsOptional()
    @IsIn(['active', 'inactive', 'archive'])
    @Expose()
    status: 'active' | 'inactive' | 'archive';

    constructor(obj?: Partial<TenantUpdateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
