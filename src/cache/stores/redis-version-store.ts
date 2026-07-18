import type KeyvRedis from "@keyv/redis";
import { CacheVersionStore } from "../interfaces/cache-version-store.interface";

/**
 * Redis-backed counter store. Bypasses the Keyv/cache-manager value layer
 * entirely and talks to the raw redis client, because cache-manager's Cache
 * interface (get/mget/set/mset/del/mdel) has no atomic increment — a
 * get-then-set here would reintroduce the exact stale-write race §1.3 rules
 * out.
 */
export class RedisCacheVersionStore implements CacheVersionStore {
  constructor(private readonly redisStore: KeyvRedis<string>) {}

  async get(key: string): Promise<number | undefined> {
    const client = await this.redisStore.getClient();
    const value = await client.get(key);
    return value === null || value === undefined ? undefined : Number(value);
  }

  async mget(keys: string[]): Promise<Array<number | undefined>> {
    if (keys.length === 0) return [];
    const client = await this.redisStore.getClient();
    const values = await client.mGet(keys);
    return values.map((value) => (value === null || value === undefined ? undefined : Number(value)));
  }

  async incr(key: string): Promise<number> {
    const client = await this.redisStore.getClient();
    const next = Number(await client.incr(key));
    if (next > 1) return next;
    // INCR on a missing key yields 1 — the same value readers already assume
    // for a missing counter, so the bump would be invisible. Bump once more;
    // a concurrent INCR landing in between just over-invalidates, never under.
    return Number(await client.incr(key));
  }
}
