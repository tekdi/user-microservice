import { Max, Min } from "class-validator";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum TenantStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived"
}

@Entity("Tenants")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  tenantId: string; // UUID field

  @Column({ type: "text" })
  name: string; // Text field for tenant's name

  @Column({ type: "text", nullable: true })
  type: string | null; // Text field for tenant's type

  @Column({ type: "text", nullable: true })
  domain: string | null; // Text field for tenant's domain

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date; // Timestamp for creation date with timezone

  @UpdateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  updatedAt: Date; // Timestamp for last updated date with timezone

  @Column({ type: "jsonb", nullable: true })
  params: Record<string, any>; // JSONB field for additional parameters

  @Column({ type: "json", nullable: true })
  programImages: string[]; // JSON field to store array of program images

  @Column({ type: "text" })
  description: string;

  @Column({
    type: "enum",
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status: TenantStatus;

  @Column("int4", { nullable: false })
  @Min(0)
  @Max(999999)
  ordering: number = 0;

  @Column({ type: "text", nullable: true })
  programHead: string | null; // UUID of the user who created the tenant

  @Column({ type: 'varchar', length: 255, nullable: true })
  templateId: string;
    
  @Column({ type: "text" })
  contentFramework: string;

  @Column({ type: "text" })
  channelId: string;

  @Column({ type: "text" })
  collectionFramework: string;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null; // UUID of the user who created the tenant

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null; // UUID of the user who last updated the tenant

  @Column({ type: 'json', nullable: true })
  contentFilter: any;

  @Column({ type: "uuid", nullable: true })
  parentId: string | null; // UUID of the parent tenant
}
