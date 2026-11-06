import { PartialType } from "@nestjs/swagger";
import { ConnectProfileFieldsDto } from "./join-connect.dto";

/**
 * PATCH /connect/me: every field optional, only changed fields are sent.
 * null clears only about; the other fields are required on the profile.
 */
export class UpdateConnectProfileDto extends PartialType(
  ConnectProfileFieldsDto
) {}
