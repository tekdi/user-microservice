import { Expose } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { TenantStatus } from "../entities/tenent.entity";

export class TenantUpdateDto {
    //tenant name
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    name?: string;

    //type
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    type?: string;

    //domain
    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    domain?: string;

    //params
    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    params?: object;

    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    contentFilter?: object;

    //file path
    @ApiPropertyOptional({ type: () => [String] })
    @IsOptional()
    @Expose()
    programImages?: string[];


    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    description?: string;


    //status
    @ApiPropertyOptional({
        type: String,
        description: "Status of the tenant",
        enum: TenantStatus,
        default: TenantStatus.ACTIVE,
    })
    @IsString()
    @IsOptional()
    @IsIn([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.ARCHIVED])
    @Expose()
    status?: TenantStatus;

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    createdBy?: string;

    @Expose()
    updatedBy: string;

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    programHead?: string;

    @ApiPropertyOptional({ type: () => String, description: 'Parent Tenant ID (UUID)' })
    @IsString()
    @IsUUID()
    @IsOptional()
    parentId?: string;

    constructor(obj?: Partial<TenantUpdateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
