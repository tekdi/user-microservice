import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";

// Enum for exam fee status validation
enum ExamFeeStatus {
  Yes = "Yes",
  No = "No",
  NA = "NA",
}

class BoardDTO {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  boardId: string;
}

class SubjectDTO {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subjectId: string;
}

export class RegisterForBoardEnrolmentDto {
  @IsOptional()
  @Type(() => BoardDTO)
  board: BoardDTO;

  @IsOptional()
  @IsArray()
  @Type(() => SubjectDTO)
  subjects: SubjectDTO[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  boardEnrolmentNumber: string;

  @IsOptional()
  @IsEnum(ExamFeeStatus)
  examFeePaid: ExamFeeStatus;

  @IsString()
  @IsNotEmpty()
  cohortMembershipId: string;
}
