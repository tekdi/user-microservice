import {
  Entity,
  PrimaryColumn,
  Column,
} from "typeorm";

@Entity({ name: "state" })
export class State {
  @PrimaryColumn({ type: "integer" })
  state_id: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  state_name: string;

  @Column({ type: "char", length: 2, nullable: true })
  state_code: string;

  @Column({ type: "integer", nullable: true })
  state_id_pc: number;

  @Column({ type: "varchar", length: 20, nullable: true })
  state_id_finance: string;

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