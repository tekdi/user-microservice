import { ApiProperty } from "@nestjs/swagger";
import {
    IsNumber,
    IsUUID,
    Min,
    IsString,
    IsOptional,
    ArrayNotEmpty,
    ValidateNested,
} from 'class-validator';
import { Type, Expose } from 'class-transformer';

export class UpdateOrderDto {
    @ApiProperty({
        description: "Pathway UUID",
        example: "61d1b6bf-c20c-401d-863a-8c85567916e8",
    })
    @Expose()
    @IsUUID()
    id: string;
    @ApiProperty({
        description: "Pathway name",
        required: false,
    })
    @Expose()
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({
        description: "New display order for the pathway",
        example: 35,
        minimum: 0,
    })
    @Expose()
    @IsNumber()
    @Min(0)
    order: number;
}

export class BulkUpdateOrderDto {
    @ApiProperty({
        description: "Array of pathways with their new display orders",
        type: [UpdateOrderDto],
    })
    @Expose()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => UpdateOrderDto)
    orders: UpdateOrderDto[];
}
