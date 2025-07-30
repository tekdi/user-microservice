import { CacheStrategy } from "../cache.interface";
import { Logger } from "@nestjs/common";

interface CacheEntry {
  value: any;
  expiresAt?: number;
}

export class InMemoryCacheStrategy implements CacheStrategy {
  private readonly logger = new Logger(InMemoryCacheStrategy.name);
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL: number; // in seconds

  constructor(defaultTTL: number = 3600) {
    this.defaultTTL = defaultTTL;
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      const entry = this.cache.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return undefined;
      }
      return entry.value as T;
    } catch (e) {
      this.logger.error(`InMemory get failed: ${e.message}`);
      return undefined;
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const expiresAt = ttl === 0 ? undefined : Date.now() + 1000 * (ttl || this.defaultTTL);
      this.cache.set(key, { value, expiresAt });
    } catch (e) {
      this.logger.error(`InMemory set failed: ${e.message}`);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async reset(): Promise<void> {
    this.cache.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
} 