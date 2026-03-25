import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GenerateCertificateRequestDto {
  @ApiProperty({ format: 'uuid', example: '51d8e436-8d83-4805-b63f-377af6c9b0a6' })
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @ApiProperty({ format: 'uuid', example: '86b6f113-3f13-4f52-b3e4-ef1d3440733a' })
  @IsNotEmpty()
  @IsUUID()
  courseId: string;

  @ApiProperty({
    example: '2025-12-12T00:00:00.000Z',
    description: 'Certificate issuance date (ISO 8601 string passed through to certificate service)',
  })
  @IsNotEmpty()
  @IsString()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'issuanceDate must be a valid ISO 8601 date-time string' },
  )
  issuanceDate: string;

  @ApiProperty({
    example: '0000-00-00T00:00:00.000Z',
    description: 'Certificate expiration date (as accepted by certificate service)',
  })
  @IsNotEmpty()
  @IsString()
  expirationDate: string;

  @ApiProperty({
    format: 'uuid',
    example: 'a9d4a604-97b4-4c6b-8acf-48ac64afe6c3',
    description: 'Payment transaction whose intent targets are unlocked after successful generation',
  })
  @IsNotEmpty()
  @IsUUID()
  transactionId: string;
}
