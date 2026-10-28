import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiBasicAuth, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { IsBoolean, IsOptional, IsUUID } from "class-validator";
import { Response } from "express";
import { Repository } from "typeorm";
import { JwtAuthGuard } from "../common/guards/keycloak.guard";
import APIResponse from "../common/responses/response";
import { DevRevRecordService } from "./devrev-record.service";
import { DevRevSyncQueue } from "./devrev-sync.queue";
import { DevRevSync, DevRevSyncStatus } from "./entities/devrev-sync.entity";
import { LearnerSourceLoader } from "./learner-source.loader";

export class DevRevResyncDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  cohortId?: string;
}

export class DevRevBackfillDto {
  @IsUUID()
  cohortId: string;

  /** Count the learners that would be queued, and queue nothing. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

const API = {
  RESYNC: "api.devrev-sync.resync",
  BACKFILL: "api.devrev-sync.backfill",
  STATUS: "api.devrev-sync.status",
  RETRY: "api.devrev-sync.retry-failed",
};

/**
 * Admin endpoints for the DevRev sync: re-sync or backfill learners and see
 * sync state. Every endpoint answers 409 while sync is off.
 */
@ApiTags("DevRev Sync")
@Controller("devrev-sync")
@UsePipes(new ValidationPipe({ whitelist: true }))
export class DevRevSyncController {
  constructor(
    private readonly queue: DevRevSyncQueue,
    private readonly records: DevRevRecordService,
    private readonly loader: LearnerSourceLoader,
    @InjectRepository(DevRevSync)
    private readonly syncRepository: Repository<DevRevSync>
  ) {}

  /**
   * Re-send one learner or a whole cohort in full, ignoring the "unchanged"
   * check. Use after fixing data or a DevRev schema problem; also the backfill
   * entry point for a cohort.
   */
  @Post("resync")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  async resync(@Body() body: DevRevResyncDto, @Res() res: Response) {
    if (!this.queue.isRunning) return this.disabled(res, API.RESYNC);
    if (!body.userId && !body.cohortId) {
      return APIResponse.error(
        res,
        API.RESYNC,
        "BAD_REQUEST",
        "userId or cohortId is required",
        HttpStatus.BAD_REQUEST
      );
    }

    const userIds = body.userId
      ? [body.userId]
      : await this.loader.userIdsInCohort(body.cohortId);
    await this.records.markForResync(userIds);
    const queued = await this.queue.enqueueLearners(userIds);
    return APIResponse.success(
      res,
      API.RESYNC,
      { queued },
      HttpStatus.OK,
      `Queued ${queued} learner(s) for DevRev sync`
    );
  }

  /**
   * Queue every learner in a cohort. Unlike resync, payload hashes are kept,
   * so a repeated backfill only sends records that changed. dryRun counts the
   * learners without queueing. Run cohort by cohort, oldest first.
   */
  @Post("backfill")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  async backfill(@Body() body: DevRevBackfillDto, @Res() res: Response) {
    if (!this.queue.isRunning) return this.disabled(res, API.BACKFILL);
    const userIds = await this.loader.userIdsInCohort(body.cohortId);
    const queued = body.dryRun
      ? 0
      : await this.queue.enqueueLearners(userIds);
    return APIResponse.success(
      res,
      API.BACKFILL,
      { learners: userIds.length, queued, dryRun: !!body.dryRun },
      HttpStatus.OK,
      body.dryRun
        ? `${userIds.length} learner(s) would be queued for DevRev sync`
        : `Queued ${queued} learner(s) for DevRev sync`
    );
  }

  /** Counts by record type and status, queue counts, and the latest 50 failures. */
  @Get("status")
  @UseGuards(JwtAuthGuard)
  @ApiBasicAuth("access-token")
  async status(
    @Query("cohortId") cohortId: string | undefined,
    @Res() res: Response
  ) {
    const counts = this.syncRepository
      .createQueryBuilder("s")
      .select("s.leafType", "leafType")
      .addSelect("s.status", "status")
      .addSelect("COUNT(*)::int", "count")
      .groupBy("s.leafType")
      .addGroupBy("s.status");
    const failures = this.syncRepository
      .createQueryBuilder("s")
      .select([
        "s.leafType",
        "s.externalId",
        "s.userId",
        "s.cohortId",
        "s.attempts",
        "s.retryable",
        "s.lastError",
        "s.updatedAt",
      ])
      .where("s.status = :failed", { failed: DevRevSyncStatus.FAILED })
      .orderBy("s.updatedAt", "DESC")
      .limit(50);
    if (cohortId) {
      counts.where("s.cohortId = :cohortId", { cohortId });
      failures.andWhere("s.cohortId = :cohortId", { cohortId });
    }

    const [records, recentFailures, queue] = await Promise.all([
      counts.getRawMany(),
      failures.getMany(),
      this.queue.jobCounts(),
    ]);
    return APIResponse.success(
      res,
      API.STATUS,
      { running: this.queue.isRunning, queue, records, recentFailures },
      HttpStatus.OK,
      "DevRev sync status"
    );
  }

  /**
   * Re-queue learners with a FAILED record that retrying can fix (see
   * DevRevRecordService.userIdsToRetry). Schema errors and other 4xx are left
   * for a resync after the fix. Meant for the external scheduler, like the
   * other cron/* endpoints in this service, e.g. every 15 minutes.
   */
  @Post("cron/retry-failed")
  async retryFailed(@Res() res: Response) {
    if (!this.queue.isRunning) return this.disabled(res, API.RETRY);
    const queued = await this.queue.enqueueLearners(
      await this.records.userIdsToRetry()
    );
    return APIResponse.success(
      res,
      API.RETRY,
      { queued },
      HttpStatus.OK,
      `Queued ${queued} learner(s) with failed records`
    );
  }

  private disabled(res: Response, apiId: string) {
    return APIResponse.error(
      res,
      apiId,
      "CONFLICT",
      "DevRev sync is not running (DEVREV_SYNC_ENABLED is off or the DevRev token is empty)",
      HttpStatus.CONFLICT
    );
  }
}
