import { CacheStrategy } from "../cache.interface";

// This strategy disables caching entirely while keeping the same API surface.
export class NoCacheStrategy implements CacheStrategy {
  async get<T = any>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  async set<T = any>(_key: string, _value: T, _ttl?: number): Promise<void> {
    /* no-op */
  }
  async del(_key: string): Promise<void> {
    /* no-op */
  }
  async reset(): Promise<void> {
    /* no-op */
  }
} 