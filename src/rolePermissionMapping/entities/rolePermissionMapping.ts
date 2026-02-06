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

  @Column()
  roleTitle: string;

  @Column()
  module: string;

  @Column()
  requestType: string;

  @Column()
  apiPath: string;

  @Column({ type: "uuid" })
  createdBy: string;

  @Column({ type: "uuid" })
  updatedBy: string;
  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  updatedAt: Date;
}
