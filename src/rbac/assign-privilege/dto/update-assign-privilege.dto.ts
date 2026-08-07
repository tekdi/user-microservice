import { Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsOptional, IsUUID } from "class-validator";

export class UpdateRolePrivilegesDto {
  @ApiProperty({
    type: [String],
    description: "Privilege Ids to add to the role",
    required: false,
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  @Type(() => String)
  addPrivilegeIds?: string[];

  @ApiProperty({
    type: [String],
    description: "Privilege Ids to remove from the role",
    required: false,
    default: [],
  })
  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("all", { each: true })
  @Type(() => String)
  removePrivilegeIds?: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
