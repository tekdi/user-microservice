import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ARCHIVED = "archived",
}

@Entity({ name: "Users" })
export class User {
  @PrimaryColumn({ type: "uuid" })
  userId: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  username: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  middleName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  name: string | null;

  @Column({ type: 'enum', enum: ['male', 'female', 'transgender'], nullable: true })
  gender: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  enrollmentId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile: string | null;

  @Column({ type: 'date', nullable: true })
  dob: Date | null;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    nullable: true,
  })
  createdAt: Date | null;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    nullable: true,
  })
  updatedAt: Date | null;

  @Column('text', { array: true, nullable: true })
  deviceId: string[];

  @Column({ nullable: false, default: true })
  temporaryPassword: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({
    type: "enum",
    enum: UserStatus,
    default: UserStatus.ACTIVE,
    nullable: true,
  })
  status: UserStatus | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastLogin: Date | null; // Timestamp for last login

  userRoleMappings: User;

  // @OneToMany(() => CohortMembers, cohortMember => cohortMember.cohort)
  // cohortMembers: CohortMembers[];

  @OneToMany(
    () => UserTenantMapping,
    (userTenantMapping) => userTenantMapping.user
  )
  userTenantMapping: UserTenantMapping[];
}
