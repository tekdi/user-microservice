import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUUID, IsArray } from "class-validator";

export class UserTenantMappingDto {
  @ApiProperty({
    type: String,
    description: "User Id of User",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  userId: string;

	@ApiProperty({
	type: String,
	description: "Tenant Id",
	default: [],
	})
	@Expose()
	@IsArray()
	@IsUUID(undefined, { each: true })
	@IsNotEmpty({ each: true })
	tenantId: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

export class ResponseAssignTenantDto {
  @Expose()
  userId: string;

  @Expose()
  tenantId: string;

  @Expose()
  message: string;

  constructor(data: { userId: string; tenantId: string }, message: string) {
    this.userId = data.userId;
    this.tenantId = data.tenantId;
    this.message = message;
  }
}
