import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty, IsEnum, ValidateIf } from 'class-validator';
import { Expose, Type } from 'class-transformer';
import { UserStatus } from '../entities/user-entity';
import { ApiProperty } from '@nestjs/swagger';

class UserDataDTO {

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    username: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    name: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    role: string;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    dob: string | null;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    email: string | null;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    district: string | null;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    state: string | null;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    address: string | null;

    @ApiProperty({ type: () => String })
    @IsOptional()
    @IsString()
    pincode: string | null;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    createdAt: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    updatedAt: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    createdBy: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    updatedBy: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    tenantId: string;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    @IsEnum(UserStatus)
    status: UserStatus;

    @ApiProperty({ type: () => String })
    @IsString()
    @IsOptional()
    reason: string;
}
class CustomFieldDTO {
    @ApiProperty({ type: () => String })
    @IsString()
    @Expose()
    @IsNotEmpty()
    fieldId: string;

    @ApiProperty({ type: () => String })
    @ValidateIf(o => o.value !== '')
    @IsNotEmpty()
    @Expose()
    value: string | string[];
}

export class UserUpdateDTO {

    userId: string;

    @ApiProperty({ type: () => [UserDataDTO] })
    @Expose()
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => UserDataDTO)
    userData: UserDataDTO;

    @ApiProperty({ type: () => [CustomFieldDTO] })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => CustomFieldDTO)
    @Expose()
    customFields: CustomFieldDTO[];
}
