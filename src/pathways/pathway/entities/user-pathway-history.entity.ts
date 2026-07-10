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

export enum PathwayHistoryStatus {
    ACTIVE = 'ACTIVE',
    COMPLETED = 'COMPLETED',
    EXPIRED = 'EXPIRED',
    WITHDRAWN = 'WITHDRAWN',
    INACTIVE = 'INACTIVE',
}

@Entity("user_pathway_history")
// Unique index dropped: VOLUNTEER pathways allow multiple active records per user.
// One-active-STANDARD rule is now enforced in application logic in PathwaysService.
@Index("ix_user_pathway_history_user_id", ["user_id"])
@Index("ix_user_pathway_history_pathway_id", ["pathway_id"])
@Index("ix_user_pathway_history_status", ["status"])
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

    @Column({ type: 'varchar', length: 50, default: PathwayHistoryStatus.ACTIVE, nullable: false })
    status: PathwayHistoryStatus;

    @Column({ type: 'uuid', nullable: true })
    course_id: string | null;

    @Column({ type: 'timestamp', nullable: true })
    expires_at: Date | null;

    @CreateDateColumn({
        type: "timestamp",
        default: () => "CURRENT_TIMESTAMP",
    })
    activated_at: Date;

    @Column({ type: "timestamp", nullable: true })
    deactivated_at: Date;

    @Column({ type: "text", nullable: true })
    user_goal: string;

    @Column({ type: "uuid", nullable: true })
    created_by: string;

    @Column({ type: "uuid", nullable: true })
    updated_by: string;

}
