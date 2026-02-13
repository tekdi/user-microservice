import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsBoolean } from "class-validator";
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
}
