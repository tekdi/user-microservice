import { Expose } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class TenantUpdateDto {
    //tenant name
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    name?: string;

    //domain
    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    domain?: string;

    //params
    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    params?: object;

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
        enum: ['published', 'draft', 'archived'],
        default: 'published',
    })
    @IsString()
    @IsOptional()
    @IsIn(['published', 'draft', 'archived'])
    @Expose()
    status?: 'published' | 'draft' | 'archived';

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

    constructor(obj?: Partial<TenantUpdateDto>) {
        if (obj) {
            Object.assign(this, obj);
        }
    }
}
