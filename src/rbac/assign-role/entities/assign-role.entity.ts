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
@Entity({ name: "UserRolesMapping" })
export class UserRoleMapping {
  @PrimaryGeneratedColumn("uuid")
  userRolesId: string;

  @Column("uuid", { nullable: false })
  userId: string;

  @Column("uuid", { nullable: false })
  roleId: string;

  @Column("uuid", { nullable: true })
  tenantId: string | null;

  @Column("uuid", { nullable: true })
  createdBy: string | null;

  @Column("uuid", { nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "now()",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "now()",
    nullable: true,
  })
  updatedAt: Date | null;

  // @ManyToOne(() => User, (user) => user.userRoleMappings)
  // @JoinColumn({ name: "userId" })
  // user: User;

  // @ManyToOne(() => Role)
  // @JoinColumn({ name: "roleId" })
  // role: Role;
}
