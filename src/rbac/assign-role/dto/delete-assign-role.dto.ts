import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { UserRoleMappingStatus } from "../entities/assign-role.entity";

export class DeleteAssignRoleDto {
  @ApiProperty({
    type: String,
    description: "User Id of User",
    default: "",
  })
  @Expose()
  //   @IsUUID()
  userId: string;

  @ApiProperty({
    type: String,
    description: "Tenant Id",
    default: "",
  })
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({
    type: [String], // Define roleId as an array of strings
    description: "Assigned Role Id",
    default: [],
  })
  @IsArray()
  @IsString({ each: true }) // Validate each string in the array
  //   @IsUUID(4, { each: true }) // Specify the UUID version (4) and validate each UUID string in the array
  roleId: string[];

  @ApiProperty({
    enum: UserRoleMappingStatus,
    description: "Status to set on the role mapping (active | archived).",
  })
  @IsNotEmpty()
  @IsEnum(UserRoleMappingStatus)
  status: UserRoleMappingStatus;
}

//   constructor(obj: any) {
//     Object.assign(this, obj);
//   }
