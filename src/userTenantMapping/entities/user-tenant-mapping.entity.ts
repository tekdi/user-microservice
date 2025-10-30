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

  @Column()
  createdBy: string;

  @Column()
  updatedBy: string;

  @ManyToOne(() => User, (user) => user.userTenantMapping)
  @JoinColumn({ name: "userId" })
  user: User;
}
