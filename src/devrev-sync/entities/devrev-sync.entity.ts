import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum DevRevSyncStatus {
  PENDING = "PENDING",
  SYNCED = "SYNCED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  DRY_RUN = "DRY_RUN",
}

/** Record types this service writes. `rev_user` is DevRev's stock Rev User. */
export enum DevRevLeafType {
  REV_USER = "rev_user",
  LEARNER_PROFILE = "learner_profile",
  ALP_ENROLLMENT = "alp_enrollment",
  ELP_PATHWAY = "elp_pathway",
}

/**
 * One row per DevRev record this service writes: maps our key to the DevRev
 * ID and holds the sync state. Lets an update go straight to
 * custom-objects.update, records whether the Rev User link exists (links have
 * no unique_key), and skips calls when the payload hasn't changed.
 *
 * synchronize is off in this service, so the table is created by hand:
 *
 *   CREATE TABLE IF NOT EXISTS public."DevRevSync" (
 *     "devRevSyncId"  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     "leafType"      varchar(64)  NOT NULL,
 *     "externalId"    varchar(255) NOT NULL,
 *     "uniqueKey"     varchar(255),
 *     "devrevId"      varchar(255),
 *     "userId"        uuid NOT NULL,
 *     "cohortId"      uuid,
 *     "payloadHash"   varchar(64),
 *     "linked"        boolean NOT NULL DEFAULT false,
 *     "status"        varchar(16) NOT NULL DEFAULT 'PENDING',
 *     "attempts"      integer NOT NULL DEFAULT 0,
 *     "lastError"     text,
 *     "retryable"     boolean,
 *     "lastSyncedAt"  timestamptz,
 *     "createdAt"     timestamptz NOT NULL DEFAULT now(),
 *     "updatedAt"     timestamptz NOT NULL DEFAULT now(),
 *     CONSTRAINT uq_devrev_sync_key UNIQUE ("leafType", "externalId")
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_devrev_sync_status ON public."DevRevSync" ("status", "updatedAt");
 *   CREATE INDEX IF NOT EXISTS idx_devrev_sync_user   ON public."DevRevSync" ("userId");
 *   CREATE INDEX IF NOT EXISTS idx_devrev_sync_cohort ON public."DevRevSync" ("cohortId");
 *
 * Tables created before "retryable" was added need:
 *
 *   ALTER TABLE public."DevRevSync" ADD COLUMN IF NOT EXISTS "retryable" boolean;
 */
@Entity("DevRevSync")
@Index("uq_devrev_sync_key", ["leafType", "externalId"], { unique: true })
export class DevRevSync {
  @PrimaryGeneratedColumn("uuid")
  devRevSyncId: string;

  @Column({ type: "varchar", length: 64 })
  leafType: DevRevLeafType;

  /** Our key, e.g. "{userId}:{cohort}". For a Rev User, the userId. */
  @Column({ type: "varchar", length: 255 })
  externalId: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  uniqueKey: string | null;

  /** don:... once created or found in DevRev. */
  @Column({ type: "varchar", length: 255, nullable: true })
  devrevId: string | null;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid", nullable: true })
  cohortId: string | null;

  /** sha256 of the last payload sent; unchanged payloads skip the API call. */
  @Column({ type: "varchar", length: 64, nullable: true })
  payloadHash: string | null;

  /** The Rev User -> record link has been created. */
  @Column({ type: "boolean", default: false })
  linked: boolean;

  @Column({ type: "varchar", length: 16, default: DevRevSyncStatus.PENDING })
  status: DevRevSyncStatus;

  @Column({ type: "integer", default: 0 })
  attempts: number;

  /** Error code and message only, never the payload. */
  @Column({ type: "text", nullable: true })
  lastError: string | null;

  /**
   * For a FAILED row: whether retrying can help. false for schema errors and
   * other 4xx, which retry-failed leaves alone until fixed and re-synced.
   */
  @Column({ type: "boolean", nullable: true })
  retryable: boolean | null;

  @Column({ type: "timestamptz", nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
