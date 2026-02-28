import { Max, Min } from "class-validator";
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Generated,
} from "typeorm";

export enum TenantStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived"
}

@Entity("Tenants")
export class Tenant {
  @PrimaryGeneratedColumn("uuid")
  tenantId: string;

  @Column({ type: "text", nullable: false })
  name: string;

  @Column({ type: "text", nullable: true })
  domain: string | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "now()", nullable: false })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz", default: () => "now()", nullable: false })
  updatedAt: Date;

  @Column({ type: "jsonb", nullable: true })
  params: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  programImages: string[] | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @Column("int4", { nullable: false })
  @Generated("increment")
  @Min(0)
  @Max(999999)
  ordering: number;

  @Column({ type: "text", nullable: true })
  programHead: string | null;

  @Column({
    type: "text",
    default: TenantStatus.ACTIVE,
    nullable: false,
  })
  status: TenantStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  templateId: string | null;

  @Column({ type: "text", nullable: true })
  contentFramework: string | null;

  @Column({ type: "text", nullable: true })
  collectionFramework: string | null;

  @Column({ type: "text", nullable: true })
  channelId: string | null;

  @Column({ type: 'json', nullable: true })
  contentFilter: any;

  @Column({ type: "uuid", nullable: true })
  parentId: string | null;

  @Column({ type: "text", nullable: true })
  type: string | null;
}
