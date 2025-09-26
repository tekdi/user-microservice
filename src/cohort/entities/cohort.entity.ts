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

  @Column({ nullable: true })
  parentId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  type: string;

  @Column()
  status: string;

  @Column({ type: "json", nullable: true })
  image: string[]; // JSON field to store array of program images

  @Column({ nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  metadata: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  programId: string;

  @Column()
  attendanceCaptureImage: boolean;

  @Column({ type: "json", nullable: true })
  params: Object;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt: Date;

  @Column()
  createdBy: string;

  @Column()
  updatedBy: string;
}
