import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsBoolean, IsUUID } from "class-validator";
import { Expose, Transform } from "class-transformer";
import { PaginationDto } from "../../common/dto/pagination.dto";

export class ListInterestDto extends PaginationDto {
    @ApiPropertyOptional({
        description: "Filter interests by active status",
        example: true,
    })
    @Expose()
    @Transform(({ value }) => {
        if (value === undefined || value === null) return undefined;
        return value === "true" || value === true;
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({
        description: "Search interests by label (partial match)",
        example: "Technology",
    })
    @IsOptional()
    label?: string;

    @ApiPropertyOptional({
        description: "Filter interest by ID",
        example: "123e4567-e89b-12d3-a456-426614174000",
    })
    @IsOptional()
    @IsUUID()
    id?: string;
}
