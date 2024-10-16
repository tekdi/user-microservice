import { PartialType } from "@nestjs/mapped-types";
import { PrivilegeDto } from "./privilege.dto";

export class UpdatePrivilegeDto extends PartialType(PrivilegeDto) {}
