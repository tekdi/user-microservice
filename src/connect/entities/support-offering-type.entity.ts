import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/** "Open to" options (pick up to 2 on the profile) */
@Entity("support_offering_types")
@Index("ux_support_offering_types_key", ["key"], { unique: true })
export class SupportOfferingType {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50 })
  key: string;

  @Column({ type: "varchar", length: 100 })
  label: string;

  @Column({ type: "int", default: 0 })
  displayOrder: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
