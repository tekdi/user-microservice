import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImportReferralsDto {
  @ApiProperty({
    description:
      'CSV content with header: firstName,lastName,type,subType,region,contactEmail,country',
  })
  @IsString()
  @IsNotEmpty()
  csv: string;
}

