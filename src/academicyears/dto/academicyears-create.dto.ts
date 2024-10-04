import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsUUID, MinDate } from 'class-validator';

export class AcademicYearDto {

    @ApiProperty({ description: 'startDate', example: '2024-10-05' })
    @IsNotEmpty()
    @IsDateString({}, { message: 'startDate must be in ISO 8601 format (e.g., YYYY-MM-DD)' })
    startDate: string;

    @ApiProperty({ description: 'endDate', example: '2024-10-10' })
    @IsDateString({}, { message: 'endDate must be in ISO 8601 format (e.g., YYYY-MM-DD)' })
    endDate: string;

    isActive?: boolean;

    session: string

    tenantId: string

    @ApiProperty({
        type: String,
        description: 'createdBy',
        example: 'eff008a8-2573-466d-b877-fddf6a4fc13e',
    })
    @IsUUID('4', { message: 'createdBy must be a valid UUID' })
    createdBy: string;

    @ApiProperty({
        type: String,
        description: 'updatedBy',
        example: 'eff008a8-2573-466d-b877-fddf6a4fc13e',
    })
    @IsUUID('4', { message: 'updatedBy must be a valid UUID' })
    updatedBy: string;

}
