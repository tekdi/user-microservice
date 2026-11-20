import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
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

/**
 * Task 16a (Swadhaar): the role a user has inside one group, separate from their own role
 * (UserRolesMapping), which a group membership never changes. Until Task 8a seeds cohort-type
 * roles in "Roles", the allowed codes are fixed here.
 */
export const COHORT_ROLE_CODES = ['learner', 'reviewer'] as const;
export type CohortRoleCode = (typeof COHORT_ROLE_CODES)[number];
export const DEFAULT_COHORT_ROLE: CohortRoleCode = 'learner';
export const COHORT_ROLE_DISPLAY_NAMES: Record<CohortRoleCode, string> = {
  learner: 'Learner',
  reviewer: 'Reviewer',
};

/**
 * Serves the application-country EXISTS filter built by
 * buildAnyApplicationCountryCondition() (user-adapter) and
 * buildApplicationCountryCondition() (cohortMembers-adapter): "userId" seeks
 * straight to one user's memberships, and carrying user_cohort_country_id in
 * the index lets the country check be satisfied without touching the heap.
 *
 * synchronize is off, so this decorator documents the index only - it must be
 * created manually against each database:
 *
 *   CREATE INDEX CONCURRENTLY idx_cohortmembers_user_country
 *     ON public."CohortMembers" ("userId", user_cohort_country_id);
 */
@Index('idx_cohortmembers_user_country', ['userId', 'userCohortCountryId'])
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
   * Aspire Leaders-specific: resolved countries.id for this member's
   * Users.currentCountry free-text value, at the moment they joined this
   * cohort. Set exactly once by
   * PostgresCohortMembersService at insert time (create/bulkCreate) and never
   * updated afterward - a user's country can legitimately differ across the
   * different cohorts they've applied to over time, so this is a per-application
   * snapshot, not a live mirror of the user's current profile. Null when the
   * user's country was blank or didn't match any row in `countries`. Not a
   * generic platform field - used only for Regional Admin report filtering.
   */
  @Column({ name: 'user_cohort_country_id', type: 'uuid', nullable: true })
  userCohortCountryId: string | null;

  /**
   * Task 16a: 'learner' or 'reviewer' in this group only (sql/022_cohort_member_role.up.sql).
   * The user's own role in UserRolesMapping is not touched.
   */
  @Column({ type: 'varchar', length: 50, default: DEFAULT_COHORT_ROLE })
  cohortRoleCode: string;
}
