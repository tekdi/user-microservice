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
  ARCHIVED = "archived",
}

@Entity({ name: "Tenants" })
export class Tenants {
  @PrimaryGeneratedColumn("uuid")
  tenantId: string;

  @Column()
  name: string;

  @Column()
  domain: string;

  @Column({
    type: "enum",
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status: TenantStatus;

  @Column({ type: "uuid", nullable: true })
  parentId: string;

  @Column({ type: "uuid", nullable: true })
  createdBy: string;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string;

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
}
