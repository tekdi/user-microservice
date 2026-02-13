import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { User } from "../../../user/entities/user-entity";
import { Pathway } from "./pathway.entity";

@Entity("user_pathway_history")
@Index("ux_one_active_pathway", ["user_id"], { unique: true, where: "is_active = true" })
export class UserPathwayHistory {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", nullable: false })
    user_id: string;

    @ManyToOne(() => User, (user) => user.userId)
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column({ type: "uuid", nullable: false })
    pathway_id: string;

    @ManyToOne(() => Pathway, (pathway) => pathway.id)
    @JoinColumn({ name: "pathway_id" })
    pathway: Pathway;

    @Column({ type: "boolean", default: true })
    is_active: boolean;

    @CreateDateColumn({
        type: "timestamp",
        default: () => "CURRENT_TIMESTAMP",
    })
    activated_at: Date;

    @Column({ type: "timestamp", nullable: true })
    deactivated_at: Date;

    @Column({ type: "text", nullable: true })
    user_goal: string;
}
