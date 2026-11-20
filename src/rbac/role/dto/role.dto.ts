import { Expose, Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { ROLE_TYPES } from "../entities/role.entity";

/** Lower-case key used by the middleware role checks and the apps, e.g. "district_incharge" */
export const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

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
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Task 8: fixed key of the role (lower case, digits, _). Made from the title when left out. Never changes after create",
    example: "district_incharge",
  })
  @Expose()
  @IsOptional()
  @Matches(ROLE_CODE_PATTERN, {
    message:
      "code must start with a letter and use only lower-case letters, digits and _ (2 to 50 characters)",
  })
  code: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Task 8: label shown in the apps. The title is used when left out",
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiProperty({
    enum: ROLE_TYPES,
    description:
      "Task 8: admin (platform admin), organisation (a user's own role) or cohort (a role inside a group)",
  })
  @Expose()
  @IsIn(ROLE_TYPES as unknown as string[])
  roleType: string;

  @ApiPropertyOptional({ type: String })
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

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

/**
 * Task 8: PUT rbac/roles/update/:id. Every field is optional; the code is never changed
 * (the middleware role checks and the apps use it).
 */
export class UpdateRoleDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    enum: ROLE_TYPES,
    description:
      "Not allowed on system roles, or on a role that users hold when changed to or from cohort",
  })
  @IsOptional()
  @IsIn(ROLE_TYPES as unknown as string[])
  roleType?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;
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

  @Expose()
  displayName: string;

  @Expose()
  roleType: string;

  constructor(roleDto: Partial<RoleDto> & { displayName?: string | null }) {
    this.roleId = roleDto.roleId;
    this.title = roleDto.title;
    this.code = roleDto.code;
    this.displayName = roleDto.displayName || roleDto.title;
    this.roleType = roleDto.roleType;
  }
}
