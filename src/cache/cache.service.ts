import { Inject, Injectable } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { LoggerUtil } from "../common/logger/LoggerUtil";
import { CACHE_CONFIG, CACHE_VERSION_STORE } from "./cache.constants";
import { CacheConfig } from "./cache.config";
import { CacheVersionStore } from "./interfaces/cache-version-store.interface";

export interface GetOrLoadOptions<T> {
  namespace: string;
  key: string;
  /** Other namespaces this read joins; their versions are embedded in the cache key too (§1.3 rule 3). */
  dependsOn?: string[];
  ttlSeconds: number;
  loader: () => Promise<T>;
}

export interface BulkGetOrLoadOptions<T> {
  ids: string[];
  /** Narrow per-id namespace, e.g. (id) => `ufields:${id}`. */
  namespaceFor: (id: string) => string;
  /** Sub-key within the per-id namespace. Defaults to a constant, since narrow namespaces usually hold one record. */
  keyFor?: (id: string) => string;
  dependsOn?: string[];
  ttlSeconds: number;
  loader: (missingIds: string[]) => Promise<Map<string, T>>;
}

type OpOutcome<T> = { ok: true; value: T } | { ok: false };

const CONTEXT = "CacheService";

@Injectable()
export class CacheService {
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(CACHE_VERSION_STORE) private readonly versionStore: CacheVersionStore,
    @Inject(CACHE_CONFIG) private readonly config: CacheConfig,
  ) {}

  /**
   * Pattern B/A/C read: resolve namespace versions, try the versioned key,
   * fall back to the loader on miss or any cache trouble. Never caches
   * null/undefined/false/empty results (§1.3 rule 5 — no negative caching).
   */
  async getOrLoad<T>(options: GetOrLoadOptions<T>): Promise<T> {
    const { namespace, key, dependsOn = [], ttlSeconds, loader } = options;

    if (!this.isNamespaceCacheable(namespace)) {
      return loader();
    }

    const versions = await this.resolveVersions([namespace, ...dependsOn]);

    if (versions) {
      const cacheKey = this.buildEntryKey(namespace, key, versions, dependsOn);
      const cached = await this.safeGet(cacheKey);
      if (cached.ok && cached.value !== undefined && cached.value !== null) {
        return cached.value as T;
      }
    }

    const result = await loader();

    if (versions && this.isCacheable(result)) {
      const cacheKey = this.buildEntryKey(namespace, key, versions, dependsOn);
      await this.safeSet(cacheKey, result, ttlSeconds);
    }

    return result;
  }

  /**
   * Bulk-hydration idiom (§1.4): one MGET of N version counters, one MGET of
   * N value keys, DB loader only for ids that missed, backfill their
   * entries. Two Redis round-trips regardless of N.
   */
  async bulkGetOrLoad<T>(options: BulkGetOrLoadOptions<T>): Promise<Map<string, T>> {
    const { ids, namespaceFor, keyFor = () => "data", dependsOn = [], ttlSeconds, loader } = options;
    const result = new Map<string, T>();
    if (ids.length === 0) return result;

    const cacheableIds = ids.filter((id) => this.isNamespaceCacheable(namespaceFor(id)));
    const uncacheableIds = ids.filter((id) => !this.isNamespaceCacheable(namespaceFor(id)));

    let versions: Map<string, number> | null = null;
    if (cacheableIds.length > 0) {
      const namespaces = [...new Set([...cacheableIds.map(namespaceFor), ...dependsOn])];
      versions = await this.resolveVersions(namespaces);
    }

    const missingIds: string[] = [...uncacheableIds];
    const entryKeyById = new Map<string, string>();

    if (versions && cacheableIds.length > 0) {
      for (const id of cacheableIds) {
        entryKeyById.set(id, this.buildEntryKey(namespaceFor(id), keyFor(id), versions, dependsOn));
      }

      const keys = cacheableIds.map((id) => entryKeyById.get(id)!);
      const mgetOutcome = await this.safeMget(keys);

      if (mgetOutcome.ok) {
        cacheableIds.forEach((id, idx) => {
          const value = mgetOutcome.value[idx];
          if (value !== undefined && value !== null) {
            result.set(id, value as T);
          } else {
            missingIds.push(id);
          }
        });
      } else {
        missingIds.push(...cacheableIds);
      }
    } else {
      missingIds.push(...cacheableIds);
    }

    if (missingIds.length > 0) {
      const loaded = await loader(missingIds);
      for (const [id, value] of loaded) {
        result.set(id, value);
      }

      if (versions) {
        const toSet: Array<{ key: string; value: T; ttl: number }> = [];
        for (const id of missingIds) {
          const entryKey = entryKeyById.get(id);
          if (!entryKey) continue; // id's namespace wasn't cacheable to begin with
          const value = loaded.get(id);
          if (this.isCacheable(value)) {
            toSet.push({ key: entryKey, value: value as T, ttl: ttlSeconds });
          }
        }
        if (toSet.length > 0) {
          await this.safeMset(toSet);
        }
      }
    }

    return result;
  }

  /**
   * Bump one or more namespaces' version counters. Callers must only invoke
   * this AFTER their DB write has committed, never before (§1.3 rule 1) —
   * this service has no way to enforce that ordering itself.
   */
  async invalidate(namespaces: string | string[]): Promise<void> {
    if (!this.config.enabled) return;

    const uniqueNamespaces = [...new Set(Array.isArray(namespaces) ? namespaces : [namespaces])];
    await Promise.all(
      uniqueNamespaces.map(async (namespace) => {
        const outcome = await this.executeOp(() => this.versionStore.incr(this.versionKey(namespace)));
        if (!outcome.ok) {
          LoggerUtil.error(`Failed to invalidate namespace ${namespace}`, "Cache invalidation bypassed (circuit open or op failure)", CONTEXT);
        }
      }),
    );
  }

  private isNamespaceCacheable(namespace: string): boolean {
    if (!this.config.enabled) return false;
    if (this.config.disabledNamespaces.has(namespace)) return false;
    const family = namespace.split(":")[0];
    return !this.config.disabledNamespaces.has(family);
  }

  /** Empty/false results are never cached — caching them would pin a "not found" past the next create (§1.3 rule 5). */
  private isCacheable(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  private versionKey(namespace: string): string {
    return `${this.config.keyPrefix}:v:${namespace}`;
  }

  private buildEntryKey(namespace: string, key: string, versions: Map<string, number>, dependsOn: string[]): string {
    const ownVersion = versions.get(namespace) ?? 1;
    let entryKey = `${this.config.keyPrefix}:${namespace}:v${ownVersion}:${key}`;
    for (const dep of dependsOn) {
      entryKey += `:${dep}v${versions.get(dep) ?? 1}`;
    }
    return entryKey;
  }

  /** Versions are read before the loader runs — this is what makes the cache-aside race in §1.3 harmless. */
  private async resolveVersions(namespaces: string[]): Promise<Map<string, number> | null> {
    const uniqueNamespaces = [...new Set(namespaces)];
    const versionKeys = uniqueNamespaces.map((ns) => this.versionKey(ns));
    const outcome = await this.executeOp(() => this.versionStore.mget(versionKeys));
    if (!outcome.ok) return null;

    const versions = new Map<string, number>();
    uniqueNamespaces.forEach((ns, idx) => versions.set(ns, outcome.value[idx] ?? 1));
    return versions;
  }

  private async safeGet(key: string): Promise<OpOutcome<unknown>> {
    return this.executeOp(() => this.cache.get(key));
  }

  private async safeMget(keys: string[]): Promise<OpOutcome<unknown[]>> {
    return this.executeOp(() => this.cache.mget(keys));
  }

  private async safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const outcome = await this.executeOp(() => this.cache.set(key, value, ttlSeconds * 1000));
    if (!outcome.ok) {
      LoggerUtil.warn(`Cache set failed for key ${key}`, CONTEXT);
    }
  }

  private async safeMset(entries: Array<{ key: string; value: unknown; ttl: number }>): Promise<void> {
    const outcome = await this.executeOp(() =>
      this.cache.mset(entries.map((e) => ({ key: e.key, value: e.value, ttl: e.ttl * 1000 }))),
    );
    if (!outcome.ok) {
      LoggerUtil.warn(`Cache mset failed for ${entries.length} keys`, CONTEXT);
    }
  }

  /**
   * Every Redis-touching op (get/set/mget/mset/incr) funnels through here:
   * per-op timeout, try/catch treating any failure as a miss (never
   * surfaced to the request — §1.5.1), and a circuit breaker that skips the
   * attempt entirely once open, so a dead Redis doesn't add timeout latency
   * to every request (§1.5.2).
   */
  private async executeOp<T>(op: () => Promise<T>): Promise<OpOutcome<T>> {
    if (this.isCircuitOpen()) {
      return { ok: false };
    }

    try {
      const value = await this.withTimeout(op(), this.config.opTimeoutMs);
      this.recordSuccess();
      return { ok: true, value };
    } catch (error) {
      this.recordFailure(error);
      return { ok: false };
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Cache op timed out after ${timeoutMs}ms`)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private isCircuitOpen(): boolean {
    return this.circuitOpenUntil > Date.now();
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private recordFailure(error: unknown): void {
    this.consecutiveFailures += 1;
    LoggerUtil.warn(
      `Cache op failed (${this.consecutiveFailures}/${this.config.cbFailures}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      CONTEXT,
    );
    if (this.consecutiveFailures >= this.config.cbFailures) {
      this.circuitOpenUntil = Date.now() + this.config.cbCooldownMs;
      LoggerUtil.error(
        `Cache circuit breaker opened for ${this.config.cbCooldownMs}ms after ${this.consecutiveFailures} consecutive failures`,
        error instanceof Error ? error.message : String(error),
        CONTEXT,
      );
    }
  }
}
