import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("AcademicYears")
export class AcademicYear {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "date", name: "startDate" })
  startDate: string;

  @Column({ type: "date", name: "endDate" })
  endDate: string;

  @Column({ type: "varchar", length: 15, name: "session" })
  session: string;

  @CreateDateColumn({
    type: "timestamp",
    name: "createdAt",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamp",
    name: "updatedAt",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt: Date;

  @Column({ type: "uuid", nullable: true })
  createdBy: string;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string;

  @Column({ type: "boolean", name: "isActive", default: true })
  isActive: boolean;

  @Column("uuid", { nullable: false })
  tenantId: string;
}
