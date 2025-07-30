import { Global, Module } from "@nestjs/common";
import { ConfigService, ConfigModule } from "@nestjs/config";
import { CACHE_STRATEGY_TOKEN, CacheService } from "./cache.service";
import { InMemoryCacheStrategy } from "./strategies/inmemory.strategy";
import { RedisCacheStrategy } from "./strategies/redis.strategy";
import { FileCacheStrategy } from "./strategies/file.strategy";
import { MultiCacheStrategy } from "./strategies/multi.strategy";
import { NoCacheStrategy } from "./strategies/nocache.strategy";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CACHE_STRATEGY_TOKEN,
      useFactory: async (configService: ConfigService) => {
        const strategy = (configService.get<string>("CACHE_STRATEGY") || "inmemory").toLowerCase();
        const cacheEnabledRaw = configService.get<string>("CACHE_ENABLED", "true").toLowerCase();
        const enabled = !["0", "false", "no", "off"].includes(cacheEnabledRaw);
        if (!enabled || strategy === "none" || strategy === "disabled") {
          return new NoCacheStrategy();
        }

        const defaultTTL = parseInt(configService.get<string>("CACHE_TTL", "3600"));
        switch (strategy) {
          case "redis": {
            const host = configService.get<string>("REDIS_HOST", "localhost");
            const port = parseInt(configService.get<string>("REDIS_PORT", "6379"));
            return await RedisCacheStrategy.create({ host, port, defaultTTL });
          }
          case "file": {
            const filePath = configService.get<string>(
              "FILE_CACHE_PATH",
              "./cache/files",
            );
            return new FileCacheStrategy(filePath, defaultTTL);
          }
          case "multi": {
            const inMemory = new InMemoryCacheStrategy(defaultTTL);
            const host = configService.get<string>("REDIS_HOST", "localhost");
            const port = parseInt(configService.get<string>("REDIS_PORT", "6379"));
            const redis = await RedisCacheStrategy.create({ host, port, defaultTTL });
            return new MultiCacheStrategy([inMemory, redis]);
          }
          case "inmemory":
          default:
            return new InMemoryCacheStrategy(defaultTTL);
        }
      },
      inject: [ConfigService],
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {} 