import { IsNotEmpty, IsString, IsInt } from "class-validator";

export class QueryParamsDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  id: string;
}
