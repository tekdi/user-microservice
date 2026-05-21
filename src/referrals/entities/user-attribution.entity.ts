import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'UserAttribution' })
export class UserAttribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  referralEntityId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referralSlug: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  originalReferralSlug: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;
}

