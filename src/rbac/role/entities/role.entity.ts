import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";

/**
 * Task 8 (sql/023): what a role is for.
 *  - admin:        platform admin roles
 *  - organisation: a user's own job role (Trainer, District Incharge, ARM)
 *  - cohort:       a role inside one group (Learner, Reviewer); kept on the membership
 *                  ("CohortMembers"."cohortRoleCode"), never mapped to a user in "UserRolesMapping"
 */
export const ROLE_TYPES = ["admin", "organisation", "cohort"] as const;
export type RoleType = (typeof ROLE_TYPES)[number];
export const DEFAULT_ROLE_TYPE: RoleType = "organisation";
export const COHORT_ROLE_TYPE: RoleType = "cohort";

@Entity({ name: "Roles" })
export class Role {
  @PrimaryGeneratedColumn("uuid")
  roleId: string;

  @Column({ name: "name" })
  title: string;

  @Column()
  code: string;

  @Column("uuid")
  tenantId: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "isSystemRole", default: false })
  isSystemRole: boolean;

  @Column({ name: "isPermissionEditable", default: true })
  isPermissionEditable: boolean;

  /** Label shown in the apps; falls back to the name when empty. The code never changes with it. */
  @Column({ type: "varchar", length: 100, nullable: true })
  displayName: string | null;

  @Column({ type: "varchar", length: 20, default: DEFAULT_ROLE_TYPE })
  roleType: string;

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

  @Column()
  createdBy: string;

  @Column()
  updatedBy: string;
}
