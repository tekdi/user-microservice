import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
import { CACHE_CONFIG } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { CacheMetrics } from "./cache.metrics";

const CONTEXT = "CacheMetrics";

/**
 * §1.6: logs the per-namespace hit/miss/error/bypass counters periodically.
 * Uses a plain unref'd interval rather than @nestjs/schedule so it carries no
 * module-registration requirement and can never hold the process open.
 */
@Injectable()
export class CacheMetricsReporter implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly metrics: CacheMetrics,
    @Inject(CACHE_CONFIG) private readonly config: CacheConfig,
  ) {}

  onModuleInit(): void {
    // Nothing to report while the master switch is off — every call is a
    // pass-through, so the counters would stay empty.
    if (!this.config.enabled) return;

    this.timer = setInterval(() => this.report(), this.config.metricsIntervalMs);
    // Do not keep the event loop alive just for metrics.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Exposed for tests and for an on-demand dump. */
  report(): void {
    if (!this.metrics.hasActivity()) return;
    LoggerUtil.log(
      `cache metrics ${JSON.stringify(this.metrics.snapshot())}`,
      CONTEXT,
    );
  }
}
