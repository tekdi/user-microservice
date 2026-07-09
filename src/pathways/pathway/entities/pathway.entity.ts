import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum PathwayType {
  STANDARD = 'STANDARD',
  VOLUNTEER = 'VOLUNTEER',
}

@Entity("pathways")
@Index(["key"], { unique: true })
@Index(["is_active"])
@Index(["display_order"])
@Index(["type"])
export class Pathway {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50, unique: true, nullable: false })
  key: string;

  @Column({ type: "varchar", length: 100, nullable: false })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column('text', { array: true, nullable: true, default: [] })
  tags: string[] | null;

  @Column({ type: "int", nullable: false })
  display_order: number;

  @Column({ type: "boolean", default: true, nullable: false })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  image_url: string | null;

  @Column({ type: 'varchar', length: 50, default: PathwayType.STANDARD, nullable: false })
  type: PathwayType;

  @Column({ type: 'boolean', default: false, nullable: false })
  allow_multiple_active: boolean;

  @Column({ type: 'int', nullable: true })
  volunteer_term_months: number | null;

  @Column({ type: 'int', nullable: true })
  reapply_after_days: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  application_opening_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  application_closing_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  notification_date: Date | null;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;
}
