import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

/** First "Say hello on LinkedIn" click per viewer/target pair; repeats are ignored */
@Entity("connect_linkedin_clicks")
@Index("ux_connect_clicks_pair", ["viewerUserId", "targetUserId"], {
  unique: true,
})
export class ConnectLinkedinClick {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  viewerUserId: string;

  @Column({ type: "uuid" })
  targetUserId: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  clickedAt: Date;
}
