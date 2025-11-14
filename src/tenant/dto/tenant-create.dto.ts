import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

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

    //type
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    type?: string;

    //domain
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
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

    @ApiPropertyOptional({ type: () => String, description: 'Parent Tenant ID (UUID)' })
    @IsString()
    @IsUUID()
    @IsOptional()
    parentId?: string;

    constructor(obj?: Partial<TenantCreateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
