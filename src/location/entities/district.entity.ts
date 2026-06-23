import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

@Entity({ name: "district" })
export class District {
  @PrimaryGeneratedColumn({ name: "district_id" })
  district_id: number;

  @Column({ type: "varchar", length: 40, nullable: true })
  district_name: string;

  @Column({ type: "integer", nullable: true })
  state_id: number;

  @Column({ type: "integer", nullable: true })
  state_id_pc: number;

  @Column({ type: "integer", nullable: true })
  district_id_pc: number;

  @Column({ type: "varchar", length: 20, nullable: true })
  district_id_finance: string;

  @Column({ type: "smallint", default: 0, nullable: false })
  is_found_in_census: number;

  @Column({ type: "varchar", length: 30, nullable: true })
  old_district_name: string;

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