import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString, IsUUID } from "class-validator";

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
    type: [String], // Define roleId as an array of strings
    description: "Assigned Role Id",
    default: [],
  })
  @IsArray()
  @IsString({ each: true }) // Validate each string in the array
  //   @IsUUID(4, { each: true }) // Specify the UUID version (4) and validate each UUID string in the array
  roleId: string[];
}

//   constructor(obj: any) {
//     Object.assign(this, obj);
//   }
