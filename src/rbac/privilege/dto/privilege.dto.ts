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
  @Expose()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    type: String,
    description: "Privilege title",
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

  @Expose()
  title: string;

  @Expose()
  code: string;

  constructor(privilegeDto: PrivilegeDto) {
    this.privilegeId = privilegeDto.privilegeId;
    this.title = privilegeDto.title;
    this.code = privilegeDto.code;
  }
}
