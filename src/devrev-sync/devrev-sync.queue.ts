import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConnectionOptions,
  Job,
  Queue,
  UnrecoverableError,
  Worker,
} from "bullmq";
import { DevRevApiError } from "./devrev.client";
import { DevRevSyncConfig } from "./devrev-sync.config";
import { LearnerSyncError, LearnerSyncService } from "./learner-sync.service";

/** Named per service so a Redis shared with the LMS/assessment queues never mixes jobs. */
export const DEVREV_SYNC_QUEUE = "devrev-sync-user-service";
export const LEARNER_JOB = "learner";

const BASE_BACKOFF_MS = 5000;

interface LearnerJobData {
  userId: string;
}

/**
 * The DevRev sync queue for this service: hooks add one "learner" job per
 * change, and the worker syncs that learner's records.
 *
 * Nothing connects to Redis unless DEVREV_SYNC_ENABLED=true. Adding a job
 * never throws and is never awaited by request handlers, so a sync problem
 * can't fail or slow a learner's request.
 */
@Injectable()
export class DevRevSyncQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("DevRevSync");
  private queue: Queue<LearnerJobData> | null = null;
  private worker: Worker<LearnerJobData> | null = null;

  constructor(
    private readonly config: DevRevSyncConfig,
    private readonly configService: ConfigService,
    private readonly learnerSync: LearnerSyncService
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log(
        "DevRev sync is disabled (DEVREV_SYNC_ENABLED is not true)"
      );
      return;
    }
    this.config.warnings.forEach((warning) => this.logger.warn(warning));
    if (!this.config.canRun) {
      this.logger.error(
        "DevRev sync is enabled but DEVREV_TOKEN is empty; sync stays off"
      );
      return;
    }
    if (this.config.syncRevUsers && !this.config.canSyncRevUsers) {
      this.logger.warn(
        "DEVREV_REV_ORG_ID is empty; Rev Users and links will not sync"
      );
    }

    const connection = this.connection();
    this.queue = new Queue<LearnerJobData>(DEVREV_SYNC_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: this.config.maxAttempts,
        backoff: { type: "devrev" },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    this.worker = new Worker<LearnerJobData>(
      DEVREV_SYNC_QUEUE,
      (job) => this.process(job),
      {
        connection,
        concurrency: this.config.concurrency,
        limiter: { max: this.config.ratePerSecond, duration: 1000 },
        settings: {
          backoffStrategy: (
            attemptsMade: number,
            _type: string,
            error: Error
          ) =>
            (error as any)?.retryAfterMs ??
            BASE_BACKOFF_MS * 2 ** (attemptsMade - 1),
        },
      }
    );
    this.worker.on("failed", (job, error) => {
      const final = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger[final ? "error" : "warn"](
        `job ${job?.id ?? "?"} ${
          final ? "failed" : `attempt ${job?.attemptsMade} failed`
        }: ${error.message}`
      );
    });
    this.worker.on("error", (error) =>
      this.logger.error(`worker error: ${error.message}`)
    );

    this.logger.log(
      `DevRev sync started${this.config.dryRun ? " in DRY-RUN mode" : ""} ` +
        `(concurrency ${this.config.concurrency}, ${this.config.ratePerSecond}/s)`
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }

  get isRunning(): boolean {
    return this.queue !== null;
  }

  /**
   * Queue a sync of one learner. Call without await from write paths.
   * Changes inside the debounce window collapse into one job; a change while
   * that learner's job is running schedules exactly one follow-up job.
   */
  enqueueLearner(
    userId: string | null | undefined,
    delayMs = this.config.debounceMs
  ): void {
    if (!this.queue || !userId) return;
    this.queue
      .add(
        LEARNER_JOB,
        { userId },
        {
          delay: delayMs,
          deduplication: { id: `learner:${userId}`, keepLastIfActive: true },
        }
      )
      .catch((error) =>
        this.logger.error(`could not queue learner ${userId}: ${error.message}`)
      );
  }

  /** Queue many learners at once (backfill, re-sync). Returns how many were queued. */
  async enqueueLearners(userIds: string[]): Promise<number> {
    if (!this.queue) return 0;
    const unique = [...new Set(userIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 500) {
      await this.queue.addBulk(
        unique.slice(i, i + 500).map((userId) => ({
          name: LEARNER_JOB,
          data: { userId },
          opts: {
            deduplication: { id: `learner:${userId}`, keepLastIfActive: true },
          },
        }))
      );
    }
    return unique.length;
  }

  async jobCounts(): Promise<Record<string, number>> {
    if (!this.queue) return {};
    return this.queue.getJobCounts(
      "waiting",
      "delayed",
      "active",
      "failed",
      "completed"
    );
  }

  private async process(job: Job<LearnerJobData>) {
    try {
      return await this.learnerSync.syncLearner(job.data.userId);
    } catch (error) {
      const retryable =
        error instanceof DevRevApiError || error instanceof LearnerSyncError
          ? error.retryable
          : true; // database or unexpected errors: worth another try
      if (!retryable) throw new UnrecoverableError((error as Error).message);
      throw error;
    }
  }

  private connection(): ConnectionOptions {
    const password = this.configService.get<string>("REDIS_PASSWORD");
    const db = this.configService.get<string>("REDIS_DB");
    return {
      host: this.configService.get<string>("REDIS_HOST") || "localhost",
      port: Number(this.configService.get<string>("REDIS_PORT") || 6379),
      ...(password ? { password } : {}),
      ...(db ? { db: Number(db) } : {}),
      // Required by bullmq for worker connections.
      maxRetriesPerRequest: null,
    };
  }
}
