import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

@Entity({ name: "block" })
export class Block {
  @PrimaryGeneratedColumn({ name: "block_id" })
  block_id: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  block_name: string;

  @Column({ type: "integer", nullable: true })
  district_id: number;

  @Column({ type: "integer", nullable: true })
  district_id_pc: number;

  @Column({ type: "integer", nullable: true })
  block_id_pc: number;

  @Column({ type: "integer", nullable: true })
  block_type: number;

  @Column({ type: "varchar", length: 20, nullable: true })
  block_id_finance: string;

  @Column({ type: "smallint", default: 0, nullable: false })
  is_found_in_census: number;

  @Column({ 
    type: "timestamp", 
    default: () => "CURRENT_TIMESTAMP",
    nullable: false 
  })
  created_at: Date;

  @Column({ 
    type: "timestamp", 
    default: () => "CURRENT_TIMESTAMP",
    nullable: false 
  })
  updated_at: Date;

  @Column({ type: "smallint", default: 1, nullable: true })
  is_active: number;
}