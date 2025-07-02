import { IsNotEmpty, IsOptional } from "class-validator";

export class CreateLocationDto {
  @IsNotEmpty()
  code: string;

  @IsNotEmpty()
  name: string;

  @IsOptional()
  parentid?: string;

  @IsNotEmpty()
  type: string;
}
