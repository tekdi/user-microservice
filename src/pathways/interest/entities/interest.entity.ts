import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from "typeorm";
import { Pathway } from "../../entities/pathway.entity";

@Entity("interests")
@Index(["pathway_id", "key"], { unique: true })
export class Interest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "pathway_id", type: "uuid", nullable: false })
  pathway_id: string;

  @ManyToOne(() => Pathway, (pathway) => pathway.id)
  @JoinColumn({ name: "pathway_id" })
  pathway: Pathway;

  @Column({ type: "varchar", length: 50, nullable: false })
  key: string;

  @Column({ type: "varchar", length: 100, nullable: false })
  label: string;

  @Column({ type: "boolean", default: true, nullable: false })
  is_active: boolean;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  created_at: Date;
}
