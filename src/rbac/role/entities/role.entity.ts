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

  @Column({ type: "varchar", length: 255, nullable: false, name:"name" })
  title: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  code: string | null;

  @Column("uuid", { nullable: true })
  tenantId: string | null;

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

  @Column("uuid", { nullable: true })
  createdBy: string | null;

  @Column("uuid", { nullable: true })
  updatedBy: string | null;
}
