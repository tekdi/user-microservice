import { Injectable } from "@nestjs/common";

export type CacheOutcome = "hit" | "miss" | "error" | "bypass";

export interface NamespaceCounters {
  hit: number;
  miss: number;
  error: number;
  bypass: number;
}

/**
 * §1.6 observability: per-namespace hit / miss / error / bypass(circuit-open)
 * counters. Plain in-process integers — deliberately not stored in Redis,
 * since they must keep working precisely when Redis is the thing failing.
 *
 * Namespaces are recorded by their *family* (the part before the first
 * colon, e.g. `ufields` for `ufields:{userId}`) so the log stays readable
 * with per-user/per-tenant namespaces in play.
 */
@Injectable()
export class CacheMetrics {
  private readonly counters = new Map<string, NamespaceCounters>();

  static family(namespace: string): string {
    return namespace.split(":")[0];
  }

  record(namespace: string, outcome: CacheOutcome): void {
    const key = CacheMetrics.family(namespace);
    let entry = this.counters.get(key);
    if (!entry) {
      entry = { hit: 0, miss: 0, error: 0, bypass: 0 };
      this.counters.set(key, entry);
    }
    entry[outcome] += 1;
  }

  /** Snapshot for logging / the health endpoint. Does not reset. */
  snapshot(): Record<string, NamespaceCounters & { hitRate: string }> {
    const out: Record<string, NamespaceCounters & { hitRate: string }> = {};
    for (const [namespace, c] of this.counters) {
      const lookups = c.hit + c.miss;
      out[namespace] = {
        ...c,
        hitRate: lookups > 0 ? `${((c.hit / lookups) * 100).toFixed(1)}%` : "n/a",
      };
    }
    return out;
  }

  hasActivity(): boolean {
    return this.counters.size > 0;
  }

  reset(): void {
    this.counters.clear();
  }
}
