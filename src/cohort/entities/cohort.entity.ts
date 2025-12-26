import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "Cohort" })
export class Cohort {
  @PrimaryGeneratedColumn("uuid")
  cohortId: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  updatedAt: Date;

  @Column({ type: "bool", nullable: false })
  attendanceCaptureImage: boolean;

  @Column({ type: "varchar", nullable: true })
  parentId: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  name: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  type: string | null;

  @Column({ type: "jsonb", nullable: true })
  image: any;

  @Column({ type: "varchar", nullable: true })
  referenceId: string | null;

  @Column({ type: "varchar", nullable: true })
  metadata: string | null;

  @Column({ type: "uuid", nullable: false })
  tenantId: string;

  @Column({ type: "varchar", nullable: true })
  programId: string | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @Column({ type: "varchar", nullable: true })
  status: string | null;
}
