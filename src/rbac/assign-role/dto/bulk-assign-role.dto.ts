import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsUUID } from "class-validator";

export class BulkAssignRoleDto {
    @ApiProperty({
        type: [String],
        description: "Array of user UUIDs to update",
        example: ["uuid-1", "uuid-2"],
    })
    @IsArray()
    @IsUUID("4", { each: true })
    @IsNotEmpty()
    userIds: string[];

    @ApiProperty({
        type: String,
        description: "Role UUID to assign",
        example: "role-uuid",
    })
    @IsUUID()
    @IsNotEmpty()
    roleId: string;
}
