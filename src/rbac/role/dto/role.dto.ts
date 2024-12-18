import { Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
  isUUID,
} from "class-validator";

export class RoleDto {
  @Expose()
  roleId: string;

  @ApiProperty({
    type: String,
    description: "The name of the role",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  title: string;

  @Expose()
  code: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  createdBy: string;

  @Expose()
  updatedBy: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

export class CreateRolesDto {
  @ApiProperty({
    type: String,
    description: "Tenant",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @ApiProperty({ type: [RoleDto] })
  @ValidateNested({ each: true })
  @Type(() => RoleDto)
  roles: RoleDto[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

export class RolesResponseDto {
  @Expose()
  roleId: string;

  @Expose()
  title: string;

  @Expose()
  code: string;

  constructor(roleDto: RoleDto) {
    this.roleId = roleDto.roleId;
    this.title = roleDto.title;
    this.code = roleDto.code;
  }
}
