import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsNotEmpty, IsUUID } from "class-validator";

export enum CohortStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    ARCHIVED = "archived",
    PENDING = "pending",
}

export class CohortStatusUpdateDto {
    @ApiProperty({
        type: [String],
        description: "Array of cohort UUIDs to update",
        example: ["uuid-1", "uuid-2"],
    })
    @IsArray()
    @IsUUID("4", { each: true })
    @IsNotEmpty()
    cohortIds: string[];

    @ApiProperty({
        enum: CohortStatus,
        description: "New status to set for the cohorts",
        example: CohortStatus.ACTIVE,
    })
    @IsEnum(CohortStatus, {
        message: "Status must be one of: active, inactive, archived, pending",
    })
    @IsNotEmpty()
    status: CohortStatus;
}
