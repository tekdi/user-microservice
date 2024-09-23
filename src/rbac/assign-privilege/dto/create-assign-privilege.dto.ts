import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsUUID } from "class-validator";

export class CreatePrivilegeRoleDto {
  @ApiProperty({
    type: Array,
    description: "Array of Privilege Ids",
    default: [],
  })
  @Expose()
  privilegeId: string[];

  @ApiProperty({
    type: String,
    description: "Role Id",
    default: "",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  roleId: string;

  @ApiProperty({
    type: Boolean,
    description: "Boolean to Delete Previous Privileges",
    default: false,
  })
  @Expose()
  @IsNotEmpty()
  deleteOld: boolean;

  @ApiProperty({
    type: String,
    description: "Tenant Id",
    default: ""
  })
  @Expose()
  @IsNotEmpty()
  tenantId: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
