import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "src/user/entities/user-entity";

export enum UserTenantMappingStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived",
  PENDING = "pending",
}

@Entity({ name: "UserTenantMapping" })
export class UserTenantMapping {
  @PrimaryGeneratedColumn("uuid")
  Id: string;

  @Column("uuid")
  userId: string;

  @Column("uuid")
  tenantId: string;

  @Column({
    type: "enum",
    enum: UserTenantMappingStatus,
    default: UserTenantMappingStatus.ACTIVE,
  })
  status: UserTenantMappingStatus;

  @Column({ type: "text", nullable: true })
  reason: string;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User, (user) => user.userTenantMapping)
  @JoinColumn({ name: "userId" })
  user: User;
}
