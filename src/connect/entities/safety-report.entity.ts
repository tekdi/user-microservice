import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { ConnectReportStatus } from "../constants/connect.constants";

/** "Report this profile" / "Report a concern". Created OPEN; only an admin changes status */
@Entity("safety_reports")
export class SafetyReport {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  reporterUserId: string;

  // null = general concern (not about a member)
  @Column({ type: "uuid", nullable: true })
  reportedUserId: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  subject: string | null;

  @Column({ type: "varchar", length: 40 })
  reason: string;

  @Column({ type: "varchar", length: 2000 })
  details: string;

  @Column({ type: "varchar", length: 20, default: ConnectReportStatus.OPEN })
  status: ConnectReportStatus;

  @Column({ type: "text", nullable: true })
  adminNote: string | null;

  @Column({ type: "uuid", nullable: true })
  reviewedBy: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
