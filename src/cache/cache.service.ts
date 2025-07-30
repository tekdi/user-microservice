import { Inject, Injectable } from "@nestjs/common";
import { CacheStrategy } from "./cache.interface";

export const CACHE_STRATEGY_TOKEN = "CACHE_STRATEGY";

@Injectable()
export class CacheService implements CacheStrategy {
  constructor(
    @Inject(CACHE_STRATEGY_TOKEN) private readonly strategy: CacheStrategy,
  ) {}

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.strategy.get<T>(key);
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    return this.strategy.set<T>(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    return this.strategy.del(key);
  }

  async reset(): Promise<void> {
    return this.strategy.reset();
  }
} 