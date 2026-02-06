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
    enum: ["active", "inactive", "archived", "pending"],
    description: "Status of the user-tenant mapping",
    default: "active",
    required: false,
    example: "pending"
  })
  @Expose()
  @IsOptional()
  @IsString({ message: "userTenantStatus must be a string" })
  @IsIn(["active", "inactive", "archived", "pending"], { 
    message: "userTenantStatus must be one of: active, inactive, archived, pending" 
  })
  userTenantStatus?: string;

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
    enum: ["active", "inactive", "archived", "pending"],
    description: "Status of the user-tenant mapping",
    example: "active"
  })
  @Expose()
  @IsNotEmpty({ message: "Status is required" })
  @IsString({ message: "Status must be a string" })
  @IsIn(["active", "inactive", "archived", "pending"], { 
    message: "Status must be one of: active, inactive, archived, pending" 
  })
  status: string;

  @ApiProperty({
    type: String,
    description: "Reason for status update",
    required: false,
    example: "User requested account deactivation"
  })
  @Expose()
  @IsOptional()
  @IsString({ message: "Reason must be a string" })
  reason?: string;

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
