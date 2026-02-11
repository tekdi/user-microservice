import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { UserPathwayHistory } from "./user-pathway-history.entity";
import { Interest } from "../../interests/entities/interest.entity";

@Entity("user_pathway_interests")
export class UserPathwayInterests {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", nullable: false })
    user_pathway_history_id: string;

    @ManyToOne(() => UserPathwayHistory)
    @JoinColumn({ name: "user_pathway_history_id" })
    userPathwayHistory: UserPathwayHistory;

    @Column({ type: "uuid", nullable: false })
    interest_id: string;

    @ManyToOne(() => Interest)
    @JoinColumn({ name: "interest_id" })
    interest: Interest;

    @CreateDateColumn({
        type: "timestamp",
        default: () => "CURRENT_TIMESTAMP",
    })
    created_at: Date;
}
