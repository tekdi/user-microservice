import { Injectable, Logger } from "@nestjs/common";
import { DevRevApiError } from "./devrev.client";
import { DevRevRecordService } from "./devrev-record.service";
import { DevRevSyncConfig } from "./devrev-sync.config";
import { DevRevLeafType, DevRevSync } from "./entities/devrev-sync.entity";
import {
  buildAlpEnrollment,
  buildLearnerProfile,
  buildRevUser,
  enrollmentExternalId,
  enrollmentTitle,
  enrollmentUniqueKey,
  learnerProfileUniqueKey,
  profileTitle,
} from "./learner-payloads";
import { LearnerSourceLoader } from "./learner-source.loader";

export interface LearnerSyncResult {
  userId: string;
  outcome: "synced" | "skipped";
  reason?: string;
  enrollments: number;
}

/**
 * Error thrown after a partial sync so the job is retried. `retryable` is
 * false only when every failure was one retrying can't fix (schema errors,
 * other 4xx).
 */
export class LearnerSyncError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null
  ) {
    super(message);
    this.name = "LearnerSyncError";
  }
}

/**
 * Syncs one learner: Rev User, learner_profile, then each ALP enrollment,
 * each linked to the Rev User. Reads current state every time, so repeated
 * or late jobs converge on the same result.
 */
@Injectable()
export class LearnerSyncService {
  private readonly logger = new Logger("DevRevSync");

  constructor(
    private readonly config: DevRevSyncConfig,
    private readonly loader: LearnerSourceLoader,
    private readonly records: DevRevRecordService
  ) {}

  async syncLearner(userId: string): Promise<LearnerSyncResult> {
    const skipped = (reason: string): LearnerSyncResult => ({
      userId,
      outcome: "skipped",
      reason,
      enrollments: 0,
    });

    if (!this.config.canRun) return skipped("sync disabled");

    const snapshot = await this.loader.load(userId);
    if (!snapshot) return skipped("user not found");
    if (!snapshot.isStudent) return skipped("not a student");
    if (
      this.config.cohortAllowlist.size > 0 &&
      snapshot.enrollments.length === 0
    ) {
      return skipped("no membership in an allowed cohort");
    }

    const { learner, enrollments } = snapshot;
    const failures: unknown[] = [];

    let revUser: DevRevSync | null = null;
    if (this.config.canSyncRevUsers) {
      revUser = await this.records.upsertRevUser(
        userId,
        buildRevUser(learner, this.config.revOrgId)
      );
    }
    const revUserId = revUser?.devrevId ?? null;

    let profile: DevRevSync | null = null;
    if (this.config.syncLearnerProfile) {
      profile = await this.records.upsertCustomObject({
        leafType: DevRevLeafType.LEARNER_PROFILE,
        uniqueKey: learnerProfileUniqueKey(userId),
        externalId: userId,
        lookupField: "aspire_user_id",
        lookupValue: userId,
        title: profileTitle(learner),
        fields: buildLearnerProfile(learner, revUserId, (field) =>
          this.logger.warn(
            `learner ${userId}: ${field} answer is not yes/no; left out`
          )
        ),
        userId,
      });
      await this.tryLink(
        profile,
        revUserId,
        this.config.profileLinkTypeId,
        failures
      );
    }

    if (this.config.syncAlpEnrollment) {
      for (const enrollment of enrollments) {
        try {
          const row = await this.records.upsertCustomObject({
            leafType: DevRevLeafType.ALP_ENROLLMENT,
            uniqueKey: enrollmentUniqueKey(userId, enrollment.cohortName),
            externalId: enrollmentExternalId(userId, enrollment.cohortName),
            lookupField: "external_id",
            lookupValue: enrollmentExternalId(userId, enrollment.cohortName),
            title: enrollmentTitle(learner, enrollment),
            fields: buildAlpEnrollment(
              learner,
              enrollment,
              profile?.devrevId ?? null
            ),
            userId,
            cohortId: enrollment.cohortId,
          });
          await this.tryLink(
            row,
            revUserId,
            this.config.recordLinkTypeId,
            failures
          );
        } catch (error) {
          failures.push(error);
        }
      }
    }

    if (failures.length > 0) throw this.combine(userId, failures);

    this.logger.log(
      `learner ${userId} synced: profile=${
        profile ? "yes" : "off"
      }, enrollments=${enrollments.length}`
    );
    return { userId, outcome: "synced", enrollments: enrollments.length };
  }

  private async tryLink(
    record: DevRevSync,
    revUserId: string | null,
    linkTypeId: string,
    failures: unknown[]
  ): Promise<void> {
    try {
      await this.records.ensureLink(record, revUserId, linkTypeId);
    } catch (error) {
      failures.push(error);
    }
  }

  private combine(userId: string, failures: unknown[]): LearnerSyncError {
    const apiErrors = failures.filter(
      (f): f is DevRevApiError => f instanceof DevRevApiError
    );
    const retryable =
      apiErrors.length < failures.length || apiErrors.some((e) => e.retryable);
    const retryAfterMs = apiErrors.reduce<number | null>(
      (max, e) =>
        e.retryAfterMs && e.retryAfterMs > (max ?? 0) ? e.retryAfterMs : max,
      null
    );
    const messages = failures.map((f) => (f as Error)?.message ?? String(f));
    return new LearnerSyncError(
      `learner ${userId}: ${failures.length} record(s) failed: ${messages.join(
        "; "
      )}`,
      retryable,
      retryAfterMs
    );
  }
}
