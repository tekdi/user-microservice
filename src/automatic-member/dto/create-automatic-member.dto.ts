import { IsUUID,IsObject, IsBoolean, IsOptional } from 'class-validator';

export class CreateAutomaticMemberDto {
  @IsUUID()
  userId: string;

  @IsObject()
  rules: any;

  @IsUUID()
  tenantId: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
