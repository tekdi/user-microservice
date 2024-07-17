import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DROPOUT = 'dropout',
  ARCHIVED = 'archived'
}

@Entity('CohortMembers')
export class CohortMembers {
  @PrimaryGeneratedColumn('uuid')
  cohortMembershipId: string;

  @Column({ type: 'uuid' })
  cohortId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'date', default: () => 'CURRENT_DATE' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'date', default: () => 'CURRENT_DATE' })
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string;

  @Column({ type: 'varchar' })
  statusReason: string;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    default: MemberStatus.ACTIVE
  })
  status: MemberStatus;
}
