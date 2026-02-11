import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsUUID } from "class-validator";
import { Expose } from "class-transformer";

export class SaveUserInterestsDto {
    @ApiProperty({
        description: "User Pathway History UUID",
        example: "uph-uuid",
        format: "uuid",
    })
    @Expose()
    @IsUUID()
    @IsNotEmpty()
    userPathwayHistoryId: string;

    @ApiProperty({
        description: "Array of Interest UUIDs",
        example: ["i1-uuid", "i2-uuid"],
        type: [String],
    })
    @Expose()
    @IsArray()
    @IsNotEmpty()
    @IsUUID("4", { each: true })
    interestIds: string[];
}
