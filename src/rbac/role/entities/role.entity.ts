import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";

@Entity({ name: "Roles" })
export class Role {
  @PrimaryGeneratedColumn("uuid")
  roleId: string;

  @Column({ name: "name" })
  title: string;

  @Column()
  code: string;

  @Column("uuid")
  tenantId: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "isSystemRole", default: false })
  isSystemRole: boolean;

  @Column({ name: "isPermissionEditable", default: true })
  isPermissionEditable: boolean;

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
}
