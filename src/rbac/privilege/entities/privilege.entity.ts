// export class Privilege {}
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "Privileges" })
export class Privilege {
  @PrimaryGeneratedColumn("uuid")
  privilegeId: string;

  @Column({ name: "name" })
  title: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: "varchar", nullable: true })
  module: string | null;

  @Column({ type: "varchar", nullable: true })
  submodule: string | null;

  @Column({ type: "varchar", nullable: true })
  action: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "isVisibleInUI", default: true })
  isVisibleInUI: boolean;

  @Column({ name: "displayOrder", default: 0 })
  displayOrder: number;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

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
