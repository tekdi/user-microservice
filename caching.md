# API Caching Recommendations for User Microservice

## Executive Summary

This document provides a comprehensive analysis of all API endpoints in the User Microservice and identifies opportunities for implementing caching to improve performance, reduce database load, and enhance user experience. The recommendations are categorized by priority level and include specific caching strategies for each endpoint.

---

## Technical Context for the User Microservice

### 1. Service Architecture & Caching Layer

The User Microservice is built with **NestJS 10** and deployed as a containerised workload in Kubernetes.  A custom, _pluggable_ caching layer lives under `src/cache` and is registered **globally** during application bootstrap.  All controllers, services, guards, and pipes can therefore inject `CacheService` directly without additional module wiring.

| File / Dir | Responsibility |
|------------|----------------|
| `src/cache/cache.module.ts` | Detects environment variables and selects an appropriate strategy at runtime. |
| `src/cache/cache.service.ts` | Thin wrapper that exposes a unified API—`get`, `set`, `del`, `reset`—regardless of the underlying store. |
| `src/cache/strategies/` | Strategy implementations: **In-Memory**, **Redis**, **File-system**, **Multi-layer**, and **NoCache**. |

The **MultiCacheStrategy** can fan-out writes to Redis _and_ hold a short-lived in-memory replica, delivering sub-millisecond reads for hot keys while still providing cross-pod consistency.

### 2. Environment Variables

The behaviour of the cache layer is driven entirely by configuration so that the same container image can run in development, staging, and production:

| Variable | Allowed Values | Default | Purpose |
|----------|----------------|---------|---------|
| `CACHE_STRATEGY` | `redis`, `inmemory`, `file`, `multi`, `none` | `inmemory` | Selects strategy; `none` or `CACHE_ENABLED=false` disables caching altogether. |
| `CACHE_ENABLED` | `true` \| `false` | `true` | Master switch that forces **NoCacheStrategy** when `false`. |
| `CACHE_TTL` | Integer seconds | `3600` | Global fallback TTL when none is supplied programmatically. |
| `REDIS_HOST` / `REDIS_PORT` | host / port | `localhost` / `6379` | Connection details for Redis strategy. |
| `FILE_CACHE_PATH` | Path | `./cache/files` | Storage path used by File strategy. |

**Example `.env` for production**
```ini
CACHE_STRATEGY=redis
REDIS_HOST=redis-master
REDIS_PORT=6379
CACHE_TTL=900
```

### 3. Using `CacheService` in Business Logic

```ts
import { Injectable } from "@nestjs/common";
import { CacheService } from "src/cache/cache.service";
import { UserRepository } from "src/user/user.repository";
import { UserDto } from "src/user/dto/user-response.dto";

@Injectable()
export class UserService {
  constructor(
    private readonly cache: CacheService,
    private readonly repo: UserRepository,
  ) {}

  async getUserProfile(userId: string, tenantId: string): Promise<UserDto> {
    const cacheKey = `user:profile:${userId}:${tenantId}`;

    // 1. Fast path — return from cache if present
    const cached = await this.cache.get<UserDto>(cacheKey);
    if (cached) return cached;

    // 2. Fallback to database
    const entity = await this.repo.findById(userId);
    const dto = this.mapToDto(entity);

    // 3. Store in cache for 30 minutes (1 800 seconds)
    await this.cache.set(cacheKey, dto, 1800);
    return dto;
  }

  private mapToDto(/* … */) /* … */ {}
}
```

### 4. Invalidation Guidelines

1. **Write-through**: Any service that mutates state must immediately `del` the affected keys or overwrite them with fresh values.
2. **Bulk changes** (e.g. role assignment, CSV imports) should publish a **Kafka** event that downstream consumers use to clear or rebuild their portion of the key-space.
3. **Scheduled flushes**: Use `CacheService.reset()` only during maintenance windows; routine operations should rely on TTL and targeted invalidation.

These practices ensure the recommendations in the next sections can be implemented safely without risking stale data.

---
