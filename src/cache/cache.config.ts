import { ConfigService } from "@nestjs/config";
import { LoggerUtil } from "../common/logger/LoggerUtil";

const CONTEXT = "CacheConfig";

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
    console.log(configService.get<string>("CACHE_ENABLED"))

  let enabled = toBool(configService.get<string>("CACHE_ENABLED"), false);
  const redisUrl = configService.get<string>("REDIS_URL");
  const resolvedProvider = provider === "redis" ? "redis" : "memory";

  // CACHE_PROVIDER=redis with no REDIS_URL is a misconfiguration, not a
  // runtime Redis outage — §1.5's memory fallback exists for the latter.
  // Silently caching in-process here would look identical to real Redis on
  // one box but break cross-pod invalidation in any multi-instance
  // deployment. Turn caching off entirely instead; the rest of the service
  // must keep serving uncached, exactly as CACHE_ENABLED=false would.
  if (enabled && resolvedProvider === "redis" && !redisUrl) {
    enabled = false;
    LoggerUtil.error(
      "CACHE_ENABLED=true and CACHE_PROVIDER=redis but REDIS_URL is not set",
      "Caching disabled for this process — set REDIS_URL or CACHE_PROVIDER=memory",
      CONTEXT,
    );
  }

  return {
    enabled,
    provider: resolvedProvider,
    redisUrl,
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
