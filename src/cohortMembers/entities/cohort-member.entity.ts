import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum MemberStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  DROPOUT = "dropout",
  ARCHIVED = "archived",
  REASSIGNED = "reassigned",
}

@Entity("CohortMembers")
export class CohortMembers {
  @PrimaryGeneratedColumn("uuid")
  cohortMembershipId: string;

  @CreateDateColumn({ type: "date", default: () => "now()", nullable: true })
  createdAt: Date | null;

  @UpdateDateColumn({ type: "date", default: () => "now()", nullable: true })
  updatedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  cohortId: string | null;

  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @Column({
    type: "enum",
    enum: MemberStatus,
    default: MemberStatus.ACTIVE,
    nullable: true,
  })
  status: MemberStatus | null;

  @Column({ type: "text", nullable: true })
  statusReason: string | null;

  @Column({ type: "uuid", nullable: true })
  cohortAcademicYearId: string | null;
}
