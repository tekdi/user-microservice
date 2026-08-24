import { Global, Inject, Module, OnApplicationShutdown, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { createCache } from "cache-manager";
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";
import { LoggerUtil } from "../common/logger/LoggerUtil";
import { CACHE_CONFIG, CACHE_REDIS_HANDLE, CACHE_VERSION_STORE } from "./cache.constants";
import { loadCacheConfig, CacheConfig } from "./cache.config";
import { CacheService } from "./cache.service";
import { MemoryCacheVersionStore } from "./stores/memory-version-store";
import { RedisCacheVersionStore } from "./stores/redis-version-store";
import { CacheMetrics } from "./cache.metrics";
import { CacheHealthIndicator } from "./cache-health.indicator";

const CONTEXT = "CacheModule";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CACHE_CONFIG,
      useFactory: (configService: ConfigService) => loadCacheConfig(configService),
      inject: [ConfigService],
    },
    {
      // Single shared KeyvRedis instance (one Redis connection) reused by both
      // the value cache below and the raw-client version store — undefined
      // for the memory provider, or whenever caching is disabled.
      // loadCacheConfig() already forces config.enabled=false if provider is
      // "redis" with no REDIS_URL, so by the time this factory runs,
      // enabled && provider === "redis" implies redisUrl is set.
      provide: CACHE_REDIS_HANDLE,
      useFactory: (config: CacheConfig): KeyvRedis<string> | undefined => {
        // CACHE_ENABLED=false must mean no Redis connection at all, not just
        // "reads/writes are skipped" — otherwise a disabled cache still opens
        // a live socket and the startup probe reports it as connected.
        if (!config.enabled) return undefined;
        if (config.provider !== "redis" || !config.redisUrl) return undefined;
        const redisStore = new KeyvRedis<string>(config.redisUrl, { throwOnErrors: false });
        redisStore.on("error", (error: unknown) => {
          LoggerUtil.warn(`Redis cache store error: ${error instanceof Error ? error.message : String(error)}`, CONTEXT);
        });
        return redisStore;
      },
      inject: [CACHE_CONFIG],
    },
    {
      provide: CACHE_MANAGER,
      useFactory: (redisHandle: KeyvRedis<string> | undefined) =>
        createCache({
          stores: [redisHandle ? new Keyv({ store: redisHandle }) : new Keyv()],
        }),
      inject: [CACHE_REDIS_HANDLE],
    },
    {
      provide: CACHE_VERSION_STORE,
      useFactory: (redisHandle: KeyvRedis<string> | undefined) =>
        redisHandle ? new RedisCacheVersionStore(redisHandle) : new MemoryCacheVersionStore(),
      inject: [CACHE_REDIS_HANDLE],
    },
    CacheMetrics,
    CacheService,
    CacheHealthIndicator,
  ],
  exports: [CacheService, CacheMetrics, CacheHealthIndicator],
})
export class CacheModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Optional() @Inject(CACHE_REDIS_HANDLE) private readonly redisHandle?: KeyvRedis<string>,
    @Optional() @Inject(CACHE_CONFIG) private readonly config?: CacheConfig,
  ) {}

  // Startup connectivity check. A failed probe only logs — it never throws,
  // so Redis being down cannot stop the app from booting.
  async onModuleInit(): Promise<void> {
    if (this.config?.provider !== "redis" || !this.redisHandle) return;

    const timeoutMs = this.config.opTimeoutMs;
    try {
      const client: any = await this.raceTimeout(this.redisHandle.getClient(), timeoutMs);
      await this.raceTimeout(client.ping(), timeoutMs);
      LoggerUtil.log("Redis connected", CONTEXT);
    } catch {
      LoggerUtil.error("Redis not connected", "", CONTEXT);
    }
  }

  private raceTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redisHandle?.disconnect();
  }
}
