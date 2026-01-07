import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity({ name: "RolePermission" })
export class RolePermission {
  @PrimaryGeneratedColumn("uuid")
  rolePermissionId: string;

  @Column({ type: "varchar", nullable: false })
  module: string;

  @Column({ type: "varchar", nullable: false })
  apiPath: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @Column({ type: "varchar", nullable: true })
  roleTitle: string | null;

  @Column("text", { array: true, nullable: true })
  requestType: string[] | null;
}
