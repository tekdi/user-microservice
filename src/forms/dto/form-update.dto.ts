import {
    IsOptional,
    IsString,
    IsObject,
    IsNotEmptyObject,
    IsUUID,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FormUpdateDto {

    @ApiProperty({
        type: String,
        description: 'title',
        example: 'Updated Form Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiProperty({
        type: String,
        description: 'context',
        example: 'Updated Context',
    })
    @IsString()
    @IsOptional()
    context?: string;

    @ApiProperty({
        type: String,
        description: 'context type',
        example: 'Updated ContextType',
    })
    @IsString()
    @IsOptional()
    contextType?: string;

    @ApiProperty({
        description: 'fields',
        type: 'object', 
        example: { field1: 'value1', field2: 'value2' }
    })
    @IsOptional()
    @IsObject()
    @IsNotEmptyObject()
    fields?: Record<string, unknown>;

    @ApiProperty({
        type: String,
        description: 'tenantId',
        example: 'Updated tenantId',
    })
    @IsString()
    @IsOptional()
    tenantId?: string;

    @IsUUID()
    @IsOptional()
    updatedBy: string;
}
