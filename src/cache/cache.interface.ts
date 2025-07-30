export interface CacheStrategy {
  // Retrieve a value from cache. Returns undefined if key is not found or expired.
  get<T = any>(key: string): Promise<T | undefined>;

  // Store a value in cache. Optionally specify TTL in seconds.
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;

  // Delete a specific key from cache.
  del(key: string): Promise<void>;

  // Clear entire cache.
  reset(): Promise<void>;
} 