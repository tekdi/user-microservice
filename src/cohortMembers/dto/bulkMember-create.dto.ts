import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsNotEmpty,
  ArrayMaxSize,
  IsIn,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { COHORT_ROLE_CODES } from "../entities/cohort-member.entity";

/** Task 16a: one user and the role they get in the group(s) of this request */
export class BulkCohortMemberItem {
  @ApiProperty({ type: String, description: "The userId of the member" })
  @IsUUID("4")
  userId: string;

  @ApiPropertyOptional({
    enum: COHORT_ROLE_CODES,
    description: "Role in the group: learner (default) or reviewer",
  })
  @IsOptional()
  @IsIn(COHORT_ROLE_CODES as unknown as string[])
  cohortRoleCode?: string;
}

export class BulkCohortMember {
  @ApiPropertyOptional({
    type: [String],
    description:
      "The userIds of the cohort members. Not needed when `members` is sent; `cohortRoleCode` applies to all of them",
  })
  @ValidateIf((o) => !o.members)
  @IsArray()
  @ArrayNotEmpty()
  @IsNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  userId: string[];

  @ApiPropertyOptional({
    type: [BulkCohortMemberItem],
    description:
      "Task 16a: members with their group role. Used instead of `userId` when sent",
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkCohortMemberItem)
  members?: BulkCohortMemberItem[];

  @ApiPropertyOptional({
    enum: COHORT_ROLE_CODES,
    description:
      "Task 16a: group role for every userId in `userId`. Left out: new members are learners and existing members keep their role",
  })
  @IsOptional()
  @IsIn(COHORT_ROLE_CODES as unknown as string[])
  cohortRoleCode?: string;

  @ApiProperty({
    type: [String],
    description: "The cohortIds of the cohort members",
  })
  @IsArray()
  @IsOptional()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  cohortId: string[];

  @ApiProperty({
    type: [String],
    description: "The cohortIds to be removed from",
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsOptional()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(10)
  removeCohortId: string[];

  constructor(obj: any) {
    Object.assign(this, obj);
  }
}
