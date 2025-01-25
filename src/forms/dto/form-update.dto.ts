import {
    IsOptional,
    IsString,
    IsObject,
    IsNotEmptyObject,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FormUpdateDto {
    tenantId: string;

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
    })
    @IsOptional()
    @IsObject()
    @IsNotEmptyObject()
    fields?: any;

    updatedBy: string;
}
