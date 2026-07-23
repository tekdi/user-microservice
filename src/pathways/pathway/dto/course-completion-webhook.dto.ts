import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsUUID } from "class-validator";
import { Expose } from "class-transformer";

export class CourseCompletionWebhookDto {
  @ApiProperty({ description: "User UUID who completed the course", format: "uuid" })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: "LMS Course UUID that was completed", format: "uuid" })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({ description: "Pathway UUID linked to the course", format: "uuid" })
  @Expose()
  @IsUUID()
  @IsNotEmpty()
  pathwayId: string;
}
