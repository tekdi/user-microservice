import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { Expose } from "class-transformer";
import { PathwayHistoryStatus } from '../entities/user-pathway-history.entity';

export class UpdateHistoryStatusDto {
  @ApiProperty({
    description: "New status for the pathway history record.",
    enum: [PathwayHistoryStatus.COMPLETED, PathwayHistoryStatus.WITHDRAWN, PathwayHistoryStatus.INACTIVE],
    example: PathwayHistoryStatus.COMPLETED,
  })
  @Expose()
  @IsEnum([PathwayHistoryStatus.COMPLETED, PathwayHistoryStatus.WITHDRAWN, PathwayHistoryStatus.INACTIVE], {
    message: "status must be one of: COMPLETED, WITHDRAWN, INACTIVE",
  })
  @IsNotEmpty()
  status: PathwayHistoryStatus;

  @ApiProperty({
    description: "UUID of the user or system making this status update.",
    example: "8d2c6e59-91c4-4e9a-9e29-2a3b7b6b1e11",
    format: "uuid",
  })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  updated_by: string;
}
