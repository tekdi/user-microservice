import { PartialType } from "@nestjs/mapped-types";
import { CreateAutomaticMemberDto } from "./create-automatic-member.dto";

export class UpdateAutomaticMemberDto extends PartialType(
  CreateAutomaticMemberDto
) {}
