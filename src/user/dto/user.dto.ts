import { Exclude, Expose } from 'class-transformer';
import {
  MaxLength,
  IsNotEmpty,
  IsEmail,
  IsString,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDto {
  @Expose()
  tenantId: string;

  @Expose()
  userId: string;

  @ApiProperty({
    type: String,
    description: 'The username of the user',
  })
  @Expose()
  username: string;

  @ApiProperty({
    type: String,
    description: 'The name of the user',
  })
  @Expose()
  name: string;

  @ApiProperty({
    type: String,
    description: 'The role of the user',
  })
  @Expose()
  role: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The date of Birth of the user',
  })
  @Expose()
  dob: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The contact number of the user',
  })
  @Expose()
  mobile: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The email of the user',
  })
  @Expose()
  @IsEmail()
  email: string;

  @ApiProperty({
    type: String,
    description: 'The password of the user',
  })
  @Expose()
  password: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The district of the user',
  })
  @Expose()
  district: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The state of the user',
  })
  @Expose()
  state: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The address of the user',
  })
  @Expose()
  address: string;

  @ApiPropertyOptional({
    type: String,
    description: 'The pincode of the user',
  })
  @Expose()
  pincode: string;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;

  @Expose()
  createdBy: string;

  @Expose()
  updatedBy: string;

  constructor(obj: any) {
    Object.assign(this, obj);
  }

  @Expose()
  mobile_country_code: string;
}
