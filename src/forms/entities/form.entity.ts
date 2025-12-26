import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "forms" })
export class Form {
  @PrimaryGeneratedColumn("uuid")
  formid: string;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  createdat: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "now()",
    nullable: false,
  })
  updatedat: Date;

  @Column({ type: "varchar", length: 255, nullable: false })
  title: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  context: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  contextType: string | null;

  @Column({ type: "jsonb", nullable: true })
  fields: object | null;

  @Column({ type: "uuid", nullable: true })
  tenantId: string | null;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;
}
