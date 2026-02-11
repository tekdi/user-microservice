import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class ListInterestDto {
    @ApiPropertyOptional({
        description: "Filter interests by active status (default: true)",
        example: "true",
    })
    @Expose()
    @IsOptional()
    @IsString()
    isActive?: string;
}
