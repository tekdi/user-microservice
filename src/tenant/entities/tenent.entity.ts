import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("Tenants")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  tenantId: string; // UUID field

  @Column({ type: "text" })
  name: string; // Text field for tenant's name

  @Column({ type: "text" })
  domain: string; // Text field for tenant's domain

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date | String; // Timestamp for creation date with timezone

  @UpdateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date | String; // Timestamp for last updated date with timezone

  @Column({ type: "jsonb", nullable: true })
  params: Record<string, any>; // JSONB field for additional parameters

  @Column({ type: "json", nullable: true })
  programImages: string[]; // JSON field to store array of program images

  @Column({ type: "text", nullable: true })
  description: string | null; // Text field for tenant's domain

  @Column({
    type: "text",
    default: "active",
    enum: ["active", "inactive", "archive"],
  })
  status: "active" | "inactive" | "archive"; // Status column with enum values

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null; // UUID of the user who created the tenant

  @Column({ type: "uuid", nullable: true })
  updatedBy: string; // UUID of the user who last updated the tenant
}
