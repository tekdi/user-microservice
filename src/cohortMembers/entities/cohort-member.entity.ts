import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DROPOUT = 'dropout',
  ARCHIVED = 'archived',
  APPLIED = 'applied',
  SUBMITTED = 'submitted',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
}

@Entity('CohortMembers')
export class CohortMembers {
  @PrimaryGeneratedColumn('uuid')
  cohortMembershipId: string;

  @Column({ type: 'uuid' })
  cohortId: string;

  @Column({ type: 'uuid' })
  cohortAcademicYearId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
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
    default: MemberStatus.ACTIVE,
  })
  status: MemberStatus;

  /**
   * For rejected members: whether the rejection email was sent.
   * For shortlisted members: reused by send-shortlisting-emails cron to mark onStudentShortlisted sent.
   */
  @Column({ name: 'rejection_email_sent', type: 'boolean', default: false })
  rejectionEmailSent: boolean;

  /**
   * Aspire Leaders-specific: resolved countries.id for this member's Users.country
   * free-text value, at the moment they joined this cohort. Set exactly once by
   * PostgresCohortMembersService at insert time (create/bulkCreate) and never
   * updated afterward - a user's country can legitimately differ across the
   * different cohorts they've applied to over time, so this is a per-application
   * snapshot, not a live mirror of the user's current profile. Null when the
   * user's country was blank or didn't match any row in `countries`. Not a
   * generic platform field - used only for Regional Admin report filtering.
   */
  @Column({ name: 'user_cohort_country_id', type: 'uuid', nullable: true })
  userCohortCountryId: string | null;
}
