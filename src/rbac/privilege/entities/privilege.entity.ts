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

  @Column({ type: "varchar", length: 255, nullable: false })
  name: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  code: string | null;

  @Column("uuid", { nullable: true })
  createdBy: string | null;

  @Column("uuid", { nullable: true })
  updatedBy: string | null;

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
}
