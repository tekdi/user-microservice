import { IsString, IsNotEmpty, IsIn } from "class-validator";

export class MetaDataDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"])
  class: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  board: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["foundationCourse", "mainCourse"])
  type: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["Teacher", "Learner", "Admin"])
  role: string;

  @IsString()
  @IsNotEmpty()
  medium: string;
}
