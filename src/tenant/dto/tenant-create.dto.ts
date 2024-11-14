import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class TenantCreateDto {

    @Expose()
    tenantId: string;

    @Expose()
    createdAt: string;

    @Expose()
    updatedAt: string;

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

    constructor(obj?: Partial<TenantCreateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
