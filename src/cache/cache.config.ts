import { ConfigService } from "@nestjs/config";

export type CacheProvider = "memory" | "redis";

export interface CacheConfig {
  enabled: boolean;
  provider: CacheProvider;
  redisUrl?: string;
  keyPrefix: string;
  disabledNamespaces: Set<string>;
  opTimeoutMs: number;
  cbFailures: number;
  cbCooldownMs: number;
  /** §1.6 periodic counter logging cadence. */
  metricsIntervalMs: number;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && !Number.isNaN(parsed) ? parsed : fallback;
}

export function loadCacheConfig(configService: ConfigService): CacheConfig {
  const provider = (configService.get<string>("CACHE_PROVIDER") || "memory").toLowerCase();

  return {
    enabled: toBool(configService.get<string>("CACHE_ENABLED"), false),
    provider: provider === "redis" ? "redis" : "memory",
    redisUrl: configService.get<string>("REDIS_URL"),
    keyPrefix: configService.get<string>("CACHE_KEY_PREFIX") || "ums",
    disabledNamespaces: new Set(
      (configService.get<string>("CACHE_DISABLED_NAMESPACES") || "")
        .split(",")
        .map((ns) => ns.trim())
        .filter(Boolean),
    ),
    opTimeoutMs: toNumber(configService.get<string>("CACHE_OP_TIMEOUT_MS"), 150),
    cbFailures: toNumber(configService.get<string>("CACHE_CB_FAILURES"), 5),
    cbCooldownMs: toNumber(configService.get<string>("CACHE_CB_COOLDOWN_MS"), 30000),
    metricsIntervalMs: toNumber(configService.get<string>("CACHE_METRICS_INTERVAL_MS"), 60000),
  };
}
