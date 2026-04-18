import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from "typeorm";

@Entity({ name: "village" })
export class Village {
  @PrimaryGeneratedColumn({ name: "village_id" })
  village_id: number;

  @Column({ type: "varchar", length: 250, nullable: true })
  village_name: string;

  @Column({ type: "integer", nullable: true })
  block_id: number;

  @Column({ type: "integer", nullable: true })
  pc_block_id: number;

  @Column({ type: "integer", nullable: true })
  pc_village_id: number;

  @Column({ type: "integer", nullable: true })
  created_by: number;

  @Column({ type: "smallint", default: 0, nullable: false })
  is_found_in_census: number;

  @Column({ type: "smallint", default: 1, nullable: false })
  community_type: number;

  @Column({ type: "smallint", nullable: true })
  is_active: number;
}