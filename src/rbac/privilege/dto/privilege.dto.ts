import { Expose, Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";

export class PrivilegeDto {
  @Expose()
  privilegeId: string;

  @ApiProperty({
    type: String,
    description: "Privilege title",
    default: "",
  })
  @Expose({name: "title"})
  @IsNotEmpty()
  name: string;

  // 'title' property for service compatibility - always synced with 'name'
  title: string;

  @ApiProperty({
    type: String,
    description: "Privilege name",
    default: "",
  })
  @IsNotEmpty()
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
    // Map 'title' from API to 'name' for database, or use 'name' if present
    if (obj) {
      this.name = obj.name || obj.title;
      // Keep 'title' in sync with 'name' for service compatibility
      this.title = this.name;
    }
  }
}

export class CreatePrivilegesDto {
  @ApiProperty({ type: [PrivilegeDto] })
  @ValidateNested({ each: true })
  @Type(() => PrivilegeDto)
  privileges: PrivilegeDto[];
}

export class PrivilegeResponseDto {
  @Expose()
  privilegeId: string;

  @Expose({name: "title"})
  name: string;

  @Expose()
  code: string;

  constructor(privilegeDto: PrivilegeDto | any) {
    this.privilegeId = privilegeDto.privilegeId;
    // Handle both DTO (with name) and Entity (with name) - both map to 'name' internally
    this.name = privilegeDto.name || (privilegeDto as any).title;
    this.code = privilegeDto.code;
  }
}
