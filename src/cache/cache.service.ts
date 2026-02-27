import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as redis from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly cacheEnabled: boolean;
  private redisClient: redis.RedisClient | null = null;

  constructor(private readonly configService: ConfigService) {
    this.cacheEnabled = this.configService.get('CACHE_ENABLED') === 'true';
  }

  async onModuleInit() {
    if (!this.cacheEnabled) {
      this.logger.log('Cache is disabled');
      return;
    }

    try {
      const redisOptions: redis.ClientOpts = {
        host: this.configService.get('REDIS_HOST') || 'localhost',
        port: Number(this.configService.get('REDIS_PORT') || '6379'),
      };

      const password = this.configService.get('REDIS_PASSWORD');
      if (password) {
        redisOptions.password = password;
      }

      const database = this.configService.get('REDIS_DB');
      if (database) {
        redisOptions.db = Number(database);
      }

      this.logger.log(
        `Connecting to Redis at ${redisOptions.host}:${redisOptions.port}`
      );

      this.redisClient = redis.createClient(redisOptions);

      this.redisClient.on('error', (err: Error) => {
        this.logger.error(`Redis Client Error: ${err.message}`);
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis Client Connected');
      });
    } catch (error: any) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`);
      this.redisClient = null;
    }
  }

  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.cacheEnabled || !this.redisClient) {
      this.logger.debug(
        `Cache is disabled or not connected, skipping get for key ${key}`
      );
      return null;
    }

    return new Promise((resolve) => {
      this.redisClient!.get(key, (err: Error | null, value: string | null) => {
        if (err) {
          this.logger.error(
            `Error getting cache for key ${key}: ${err.message}`,
            err.stack
          );
          resolve(null);
          return;
        }

        if (value !== null && value !== undefined) {
          this.logger.debug(`Cache HIT for key ${key}`);
          try {
            resolve(JSON.parse(value));
          } catch (parseError) {
            this.logger.error(
              `Error parsing cached value for key ${key}: ${parseError}`
            );
            resolve(null);
          }
        } else {
          this.logger.debug(`Cache MISS for key ${key}`);
          resolve(null);
        }
      });
    });
  }

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    if (!this.cacheEnabled || !this.redisClient) {
      this.logger.debug(
        `Cache is disabled or not connected, skipping set for key ${key}`
      );
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Setting cache for key ${key} with TTL ${ttl}s`);
        const serializedValue = JSON.stringify(value);
        this.redisClient!.setex(
          key,
          ttl,
          serializedValue,
          (err: Error | null) => {
            if (err) {
              this.logger.error(
                `Error setting cache for key ${key}: ${err.message}`,
                err.stack
              );
              reject(err);
            } else {
              this.logger.debug(`Successfully set cache for key ${key}`);
              resolve();
            }
          }
        );
      } catch (error: any) {
        this.logger.error(
          `Error setting cache for key ${key}: ${error.message}`,
          error.stack
        );
        reject(error);
      }
    });
  }

  /**
   * Delete value from cache
   * @param key Cache key
   */
  async del(key: string): Promise<void> {
    if (!this.cacheEnabled || !this.redisClient) {
      return;
    }

    return new Promise((resolve) => {
      this.redisClient!.del(key, (err: Error | null) => {
        if (err) {
          this.logger.error(
            `Error deleting cache for key ${key}: ${err.message}`
          );
        }
        resolve();
      });
    });
  }

  /**
   * Delete all cache entries matching a pattern
   * @param pattern Redis key pattern (e.g., 'cohort:search:*')
   * @returns Number of keys deleted
   */
  async delByPattern(pattern: string): Promise<number> {
    if (!this.cacheEnabled || !this.redisClient) {
      return 0;
    }

    return new Promise((resolve) => {
      // Use KEYS to find all matching keys
      // Note: For large Redis instances, consider using SCAN instead for better performance
      this.redisClient!.keys(pattern, (err: Error | null, keys: string[]) => {
        if (err) {
          this.logger.error(
            `Error finding cache keys for pattern ${pattern}: ${err.message}`
          );
          resolve(0);
          return;
        }

        if (!keys || keys.length === 0) {
          this.logger.debug(`No cache keys found matching pattern ${pattern}`);
          resolve(0);
          return;
        }

        // Delete all matching keys
        this.redisClient!.del(...keys, (delErr: Error | null, count: number) => {
          if (delErr) {
            this.logger.error(
              `Error deleting cache keys for pattern ${pattern}: ${delErr.message}`
            );
            resolve(0);
            return;
          }

          this.logger.debug(
            `Deleted ${count} cache entries matching pattern ${pattern}`
          );
          resolve(count);
        });
      });
    });
  }

  /**
   * Clears all cache entries from the configured Redis database.
   * This affects ALL services (LMS, Assessment, User Events) using this DB.
   */
  async clearAllServicesCache(): Promise<{ cleared: boolean }> {
    if (!this.cacheEnabled || !this.redisClient) {
      this.logger.debug(
        'Cache is disabled or not connected, skipping clearAllServicesCache.'
      );
      return { cleared: false };
    }

    return new Promise<{ cleared: boolean }>((resolve, reject) => {
      this.logger.log('Executing FLUSHDB to clear all cache entries.');
      this.redisClient!.flushdb((err: Error | null, reply: string) => {
        if (err) {
          this.logger.error(
            `Error clearing all cache (FLUSHDB): ${err.message}`,
            err.stack
          );
          reject(err);
        } else {
          this.logger.log(`Successfully cleared all cache entries. Reply: ${reply}`);
          resolve({ cleared: true });
        }
      });
    });
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.quit();
    }
  }
}
