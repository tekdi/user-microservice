import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class TenantUpdateDto {
    //tenant name
    @ApiPropertyOptional({
        type: String,
        description: "Tenant name",
        default: "",
    })
    @IsString()
    @Expose()
    name: string;

    //domain
    @ApiPropertyOptional({
        type: String,
        description: "Domain Name",
        default: "",
    })
    @IsString()
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
    @Expose()
    programImages: string[];


    @ApiPropertyOptional({ type: String })
    @IsString()
    @Expose()
    description: string;

    constructor(obj?: Partial<TenantUpdateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
