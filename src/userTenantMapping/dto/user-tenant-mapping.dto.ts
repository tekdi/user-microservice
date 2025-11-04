import { Expose } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUUID, IsArray, IsOptional, IsIn } from "class-validator";

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
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    type: String,
    description: "Role Id to assign to the user in the tenant",
    default: "",
  })
  @Expose()
  @IsNotEmpty()
  @IsUUID()
  roleId: string;

  @ApiProperty({
    type: Array,
    description: "Custom fields for the user-tenant mapping. Each field should have fieldId and value properties.",
    default: [],
    required: false,
    example: [
      { fieldId: "field-uuid-1", value: "sample value" },
      { fieldId: "field-uuid-2", value: ["option1", "option2"] }
    ]
  })
  @Expose()
  @IsOptional()
  @IsArray()
  customField?: Array<{
    fieldId: string;
    value: any;
  }>;

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}

export class UpdateAssignTenantStatusDto {
  @ApiProperty({
    enum: ["active", "inactive", "archived"],
    description: "Status of the user-tenant mapping",
    example: "active"
  })
  @Expose()
  @IsNotEmpty({ message: "Status is required" })
  @IsString({ message: "Status must be a string" })
  @IsIn(["active", "inactive", "archived"], { 
    message: "Status must be one of: active, inactive, archived" 
  })
  status: string;

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
