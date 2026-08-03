import { Inject, Injectable, Optional } from "@nestjs/common";
// Type-only: keeps the ESM @keyv/redis package out of the runtime require
// graph for consumers (and test suites) that never construct a client.
import type KeyvRedis from "@keyv/redis";
import { CACHE_CONFIG, CACHE_REDIS_HANDLE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { CacheMetrics } from "./cache.metrics";

export interface CacheHealth {
  enabled: boolean;
  provider: string;
  /** "ok" | "unreachable" | "not-configured" | "disabled" */
  redis: string;
  disabledNamespaces: string[];
  namespaces: Record<string, unknown>;
}

/**
 * §1.5 rule 5: /health reports Redis informationally and NEVER fails the
 * health check because of it. A dead Redis means every read falls through to
 * the database — correct, just colder — so the pod must stay in service.
 */
@Injectable()
export class CacheHealthIndicator {
  constructor(
    @Inject(CACHE_CONFIG) private readonly config: CacheConfig,
    private readonly metrics: CacheMetrics,
    @Optional() @Inject(CACHE_REDIS_HANDLE) private readonly redisHandle?: KeyvRedis<string>,
  ) {}

  async check(): Promise<CacheHealth> {
    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      redis: await this.probeRedis(),
      disabledNamespaces: [...this.config.disabledNamespaces],
      namespaces: this.metrics.snapshot(),
    };
  }

  private async probeRedis(): Promise<string> {
    if (!this.config.enabled) return "disabled";
    if (this.config.provider !== "redis") return "not-configured";
    if (!this.redisHandle) return "not-configured";

    try {
      // Bounded by the same per-op timeout as everything else, so a hung
      // Redis cannot slow the health endpoint down.
      const client: any = await Promise.race([
        this.redisHandle.getClient(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), this.config.opTimeoutMs),
        ),
      ]);
      await Promise.race([
        client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), this.config.opTimeoutMs),
        ),
      ]);
      return "ok";
    } catch {
      // Informational only — never rethrown, never fails the health check.
      return "unreachable";
    }
  }
}
