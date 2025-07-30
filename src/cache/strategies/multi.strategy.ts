import { CacheStrategy } from "../cache.interface";
import { Logger } from "@nestjs/common";

export class MultiCacheStrategy implements CacheStrategy {
  private readonly logger = new Logger(MultiCacheStrategy.name);
  private readonly layers: CacheStrategy[];
  constructor(layers: CacheStrategy[]) {
    this.layers = layers;
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    for (const layer of this.layers) {
      try {
        const value = await layer.get<T>(key);
        if (value !== undefined) {
          return value;
        }
      } catch (err) {
        this.logger.warn(`Layer get failed, continuing: ${err.message}`);
      }
    }
    return undefined;
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    await Promise.all(
      this.layers.map((layer) => layer.set<T>(key, value, ttl).catch((e) => {
        this.logger.warn(`Layer set failed: ${e.message}`);
      })),
    );
  }

  async del(key: string): Promise<void> {
    await Promise.all(
      this.layers.map((layer) => layer.del(key).catch((e) => {
        this.logger.warn(`Layer del failed: ${e.message}`);
      })),
    );
  }

  async reset(): Promise<void> {
    await Promise.all(
      this.layers.map((layer) => layer.reset().catch((e) => {
        this.logger.warn(`Layer reset failed: ${e.message}`);
      })),
    );
  }
} 