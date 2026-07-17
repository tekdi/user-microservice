import { CacheVersionStore } from "../interfaces/cache-version-store.interface";

/**
 * In-process counter store for the "memory" provider (local/dev). A Map's
 * synchronous read-modify-write is inherently atomic within one process —
 * no lock needed, unlike the multi-pod Redis case.
 */
export class MemoryCacheVersionStore implements CacheVersionStore {
  private readonly counters = new Map<string, number>();

  async get(key: string): Promise<number | undefined> {
    return this.counters.get(key);
  }

  async mget(keys: string[]): Promise<Array<number | undefined>> {
    return keys.map((key) => this.counters.get(key));
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 1) + 1;
    this.counters.set(key, next);
    return next;
  }
}
