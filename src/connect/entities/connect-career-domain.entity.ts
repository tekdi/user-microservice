import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/** Career sub-domain, e.g. "Data & Analytics" */
@Entity("connect_career_domains")
@Index("ux_connect_career_domains_key", ["key"], { unique: true })
export class ConnectCareerDomain {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 60 })
  key: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  /** connect_career_domain_groups.id — the group name lives only there */
  @Column({ type: "uuid" })
  groupId: string;

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
