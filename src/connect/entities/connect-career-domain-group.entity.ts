import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/** Career domain group, e.g. "STEM" (the bold heading in the domain picker) */
@Entity("connect_career_domain_groups")
@Index("ux_connect_career_domain_groups_key", ["key"], { unique: true })
export class ConnectCareerDomainGroup {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 60 })
  key: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "int", default: 0 })
  displayOrder: number;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "uuid", nullable: true })
  createdBy: string | null;

  @Column({ type: "uuid", nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
