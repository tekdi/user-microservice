import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  ReferralEntityStatus,
  ReferralEntitySubType,
  ReferralEntityType,
} from '../referrals.types';

@Entity({ name: 'ReferralEntities' })
export class ReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // As requested: use firstName/lastName instead of single "name".
  // For organisations/universities, store the full display name in firstName and leave lastName null.
  @Column({ type: 'varchar', length: 255 })
  firstName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 50 })
  type: ReferralEntityType;

  @Column({ type: 'varchar', length: 50 })
  subType: ReferralEntitySubType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'uuid', nullable: true })
  linkedEntityId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  additionalEmails: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 50, default: ReferralEntityStatus.ACTIVE })
  status: ReferralEntityStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'now()' })
  updatedAt: Date;
}

