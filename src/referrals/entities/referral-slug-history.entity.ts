import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'ReferralSlugHistory' })
export class ReferralSlugHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referralEntityId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  oldSlug: string;

  @Column({ type: 'varchar', length: 100 })
  newSlug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changedBy: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'now()' })
  changedAt: Date;
}

