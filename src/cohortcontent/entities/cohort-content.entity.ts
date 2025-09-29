import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Tenant } from "src/tenant/entities/tenent.entity";

@Entity({ name: "CohortContent" })
export class CohortContent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  contentId: string;

  @Column({ type: "uuid" })
  cohortId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: "tenantId", referencedColumnName: "tenantId" })
  @Column({ type: "uuid", nullable: false })
  tenantId: string;

  @ManyToOne(() => Cohort)
  @JoinColumn({ name: "cohortId", referencedColumnName: "cohortId" })
  cohort: string;

  @Column({ type: "json", nullable: true })
  params: object;

  @Column({
    type: "enum",
    enum: ["archive", "active"],
    default: "active",
  })
  status: "archive" | "active";

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

  @Column({ type: "uuid", nullable: true })
  createdBy: string;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string;
}
