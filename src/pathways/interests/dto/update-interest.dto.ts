import { PartialType, OmitType } from "@nestjs/swagger";
import { CreateInterestDto } from "./create-interest.dto";

export class UpdateInterestDto extends PartialType(
  OmitType(CreateInterestDto, ["pathway_id"] as const)
) {}
