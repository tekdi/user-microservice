import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";
import { Expose } from "class-transformer";

export class AssignPathwayDto {
    @ApiProperty({
        description: "User UUID",
        example: "8d2c6e59-91c4-4e9a-9e29-2a3b7b6b1e11",
        format: "uuid",
    })
    @Expose()
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({
        description: "Pathway UUID",
        example: "493c04e2-a9db-47f2-b304-503da358d5f4",
        format: "uuid",
    })
    @Expose()
    @IsUUID()
    @IsNotEmpty()
    pathwayId: string;
}
