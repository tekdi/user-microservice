import { CacheStrategy } from "../cache.interface";
import { Logger } from "@nestjs/common";
import { createClient, RedisClientType } from "redis";

export class RedisCacheStrategy implements CacheStrategy {
  private readonly logger = new Logger(RedisCacheStrategy.name);
  private client: RedisClientType;
  private defaultTTL: number;

  private constructor(client: RedisClientType, defaultTTL: number) {
    this.client = client;
    this.defaultTTL = defaultTTL;
  }

  static async create(options: {
    host: string;
    port: number;
    defaultTTL: number;
  }): Promise<RedisCacheStrategy> {
    const { host, port, defaultTTL } = options;
    const client: RedisClientType = createClient({ url: `redis://${host}:${port}` });
    const logger = new Logger(RedisCacheStrategy.name);
    client.on("error", (err) => logger.error(`Redis error: ${err}`));
    try {
      if (!client.isOpen) await client.connect();
      logger.log(`Connected to Redis at ${host}:${port}`);
    } catch (err) {
      logger.error(`Failed to connect Redis: ${err}`);
    }
    return new RedisCacheStrategy(client, defaultTTL);
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      const value = await this.client.get(key);
      if (value === null || value === undefined) return undefined;
      return JSON.parse(value) as T;
    } catch (e) {
      this.logger.error(`Redis get failed: ${e.message}`);
      return undefined;
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const ttlSeconds = ttl || this.defaultTTL;
      await this.client.set(key, JSON.stringify(value), {
        EX: ttlSeconds,
      });
    } catch (e) {
      this.logger.error(`Redis set failed: ${e.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (e) {
      this.logger.error(`Redis del failed: ${e.message}`);
    }
  }

  async reset(): Promise<void> {
    try {
      await this.client.flushDb();
    } catch (e) {
      this.logger.error(`Redis reset failed: ${e.message}`);
    }
  }
} 