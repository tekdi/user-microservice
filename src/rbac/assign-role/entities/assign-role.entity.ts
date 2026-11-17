import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "src/user/entities/user-entity";
import { Role } from "../../role/entities/role.entity";
import { UserTenantMappingStatus } from "src/userTenantMapping/entities/user-tenant-mapping.entity";


export enum UserRoleMappingStatus {
  ACTIVE = "active",
  ARCHIVED = "archived"
}

@Entity({ name: "UserRolesMapping" })
export class UserRoleMapping {
  @PrimaryGeneratedColumn("uuid")
  userRolesId: string;

  @Column("uuid")
  userId: string;

  @Column("uuid")
  tenantId: string;

  @Column("uuid")
  roleId: string;

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

  @Column({
    type: "enum",
    enum: UserRoleMappingStatus,
    default: UserRoleMappingStatus.ACTIVE,
    })
  status: UserRoleMappingStatus;
  
  // @ManyToOne(() => User, (user) => user.userRoleMappings)
  // @JoinColumn({ name: "userId" })
  // user: User;

  // @ManyToOne(() => Role)
  // @JoinColumn({ name: "roleId" })
  // role: Role;
}
