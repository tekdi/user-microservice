import { CacheStrategy } from "../cache.interface";
import * as fs from "fs/promises";
import * as path from "path";
import { Logger } from "@nestjs/common";

export class FileCacheStrategy implements CacheStrategy {
  private readonly logger = new Logger(FileCacheStrategy.name);
  private basePath: string;
  private defaultTTL: number;

  constructor(basePath: string, defaultTTL: number = 3600) {
    this.basePath = basePath;
    this.defaultTTL = defaultTTL;
    // Ensure directory exists
    fs.mkdir(this.basePath, { recursive: true }).catch((err) => {
      this.logger.error(`Failed to create cache dir: ${err.message}`);
    });
  }

  private keyPath(key: string): string {
    // Replace slashes to avoid nesting
    const safeKey = key.replace(/[^a-zA-Z0-9-_:.]/g, "_");
    return path.join(this.basePath, `${safeKey}.json`);
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      const filePath = this.keyPath(key);
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        // expired
        await fs.unlink(filePath).catch(() => {});
        return undefined;
      }
      return parsed.value as T;
    } catch (err) {
      if (err.code !== "ENOENT") {
        this.logger.error(`File cache get failed: ${err.message}`);
      }
      return undefined;
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const filePath = this.keyPath(key);
      const expiresAt = ttl === 0 ? undefined : Date.now() + 1000 * (ttl || this.defaultTTL);
      await fs.writeFile(filePath, JSON.stringify({ value, expiresAt }), "utf-8");
    } catch (err) {
      this.logger.error(`File cache set failed: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      const filePath = this.keyPath(key);
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        this.logger.error(`File cache del failed: ${err.message}`);
      }
    }
  }

  async reset(): Promise<void> {
    try {
      const files = await fs.readdir(this.basePath);
      await Promise.all(
        files.map((f) => fs.unlink(path.join(this.basePath, f)).catch(() => {})),
      );
    } catch (err) {
      this.logger.error(`File cache reset failed: ${err.message}`);
    }
  }
} 