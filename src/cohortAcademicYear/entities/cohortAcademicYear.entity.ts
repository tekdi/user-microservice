import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("CohortAcademicYear")
export class CohortAcademicYear {
  @PrimaryGeneratedColumn("uuid")
  cohortAcademicYearId: string;

  @Column({ type: "uuid", nullable: false })
  academicYearId: string;

  @Column({ type: "uuid", nullable: false })
  cohortId: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ type: "uuid", nullable: false })
  createdBy: string;

  @Column({ type: "uuid", nullable: false })
  updatedBy: string;
}
