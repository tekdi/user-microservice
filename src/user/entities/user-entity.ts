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

  @Column({ unique: true })
  username: string;

  @Column({ type: "varchar", length: 50, nullable: false })
  firstName: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  middleName: string;

  @Column({ type: "varchar", length: 50, nullable: false })
  lastName: string;

  @Column({
    type: "enum",
    enum: ["male", "female", "transgender"],
    nullable: false,
  })
  gender: string;

  @Column({ type: "varchar", length: 50, nullable: false })
  enrollmentId: string;

  @Column({ type: "date", nullable: true })
  dob: Date;

  @Column({ nullable: true })
  email: string;

  // @Column({ nullable: true })
  // district: string;

  // @Column({ nullable: true })
  // state: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  pincode: string;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt: Date;

  @Column({ nullable: true })
  mobile: number;

  @Column("text", { array: true, nullable: true })
  deviceId: string[];

  @Column({ nullable: false, default: true })
  temporaryPassword: boolean;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ nullable: true })
  updatedBy: string;

  @Column({
    type: "enum",
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ nullable: true })
  reason: string;

  userRoleMappings: User;

  // @OneToMany(() => CohortMembers, cohortMember => cohortMember.cohort)
  // cohortMembers: CohortMembers[];

  @OneToMany(
    () => UserTenantMapping,
    (userTenantMapping) => userTenantMapping.user,
  )
  userTenantMapping: UserTenantMapping[];
}
