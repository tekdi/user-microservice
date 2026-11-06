import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { ConnectProfileStatus } from "../constants/connect.constants";

@Entity("connect_profiles")
@Index("ux_connect_profiles_user", ["userId"], { unique: true })
export class ConnectProfile {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 20, default: ConnectProfileStatus.ACTIVE })
  status: ConnectProfileStatus;

  @Column({ type: "timestamptz" })
  termsAcceptedAt: Date;

  @Column({ type: "varchar", length: 150 })
  headline: string;

  @Column({ type: "varchar", length: 255 })
  linkedinUrl: string;

  @Column({ type: "uuid", nullable: true })
  careerDomainId: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  currentStatus: string | null;

  /** "Open to" (support_offering_types ids), 1–2 */
  @Column({ type: "uuid", array: true, default: () => "'{}'" })
  openToIds: string[];

  @Column({ type: "text", nullable: true })
  about: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  joinedAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  leftAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  suspendedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
