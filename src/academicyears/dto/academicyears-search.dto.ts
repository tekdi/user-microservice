import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class AcademicYearSearchDto {

    @ApiProperty({ description: 'isActive', example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
