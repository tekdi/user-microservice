/**
 * Raw integer counter store for versioned-namespace invalidation (§1.3).
 * Deliberately separate from the Keyv-backed value cache: counters are plain
 * INCR-able integers, never JSON-wrapped/serialized like cached values.
 */
export interface CacheVersionStore {
  get(key: string): Promise<number | undefined>;
  mget(keys: string[]): Promise<Array<number | undefined>>;
  incr(key: string): Promise<number>;
}
