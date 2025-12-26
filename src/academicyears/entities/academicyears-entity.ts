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

  @Column({ type: "date", name: "startDate", nullable: false })
  startDate: string;

  @Column({ type: "date", name: "endDate", nullable: false })
  endDate: string;

  @Column({ type: "varchar", length: 15, name: "session", nullable: true })
  session: string | null;

  @CreateDateColumn({
    type: "timestamptz",
    name: "createdAt",
    default: () => "now()",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamptz",
    name: "updatedAt",
    default: () => "now()",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ type: "boolean", name: "isActive", default: true, nullable: true })
  isActive: boolean | null;

  @Column({ type: "uuid", name: "tenantId", nullable: true })
  tenantId: string | null;

  @Column({ type: "uuid", name: "updatedBy", nullable: true })
  updatedBy: string | null;

  @Column({ type: "uuid", name: "createdBy", nullable: true })
  createdBy: string | null;
}
