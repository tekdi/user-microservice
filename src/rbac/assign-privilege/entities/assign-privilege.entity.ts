import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from "typeorm";

@Entity({ name: "RolePrivilegesMapping" })
export class RolePrivilegeMapping {
  @PrimaryGeneratedColumn("uuid", { name: "rolePrivilegesId" })
  rolePrivilegesId: string;

  @Column("uuid", { name: "roleId", nullable: false })
  roleId: string;

  @Column("uuid", { name: "createdBy", nullable: true })
  createdBy: string | null;

  @Column("uuid", { name: "updatedBy", nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({
    name: "createdAt",
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    name: "updatedAt",
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column("uuid", { name: "privilegeId", nullable: true })
  privilegeId: string | null;

  @Column("uuid", { name: "tenantId", nullable: true })
  tenantId: string | null;
}
