import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheExampleService {
  constructor(private readonly cacheService: CacheService) {}

  /**
   * Example: Cache user data with automatic fallback to database
   */
  async getUserWithCache(userId: string) {
    const cacheKey = this.cacheService.generateKey('user', userId);
    
    return await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // This function will only run if data is not in cache
        console.log('Fetching user from database...');
        // Your actual database call here
        return { id: userId, name: 'John Doe', email: 'john@example.com' };
      },
      300 // Cache for 5 minutes
    );
  }

  /**
   * Example: Cache expensive database queries
   */
  async getActiveUsersWithCache(tenantId: string) {
    const cacheKey = this.cacheService.generateKey('active-users', tenantId);
    
    // Check if data exists in cache
    const cachedData = await this.cacheService.get(cacheKey);
    if (cachedData) {
      console.log('Returning cached active users');
      return cachedData;
    }

    // If not in cache, fetch from database
    console.log('Fetching active users from database...');
    const activeUsers = [
      { id: '1', name: 'User 1', status: 'active' },
      { id: '2', name: 'User 2', status: 'active' }
    ];

    // Store in cache for 10 minutes
    await this.cacheService.set(cacheKey, activeUsers, 600);
    
    return activeUsers;
  }

  /**
   * Example: Cache with invalidation
   */
  async updateUser(userId: string, updateData: any) {
    // Update user in database first
    console.log('Updating user in database...');
    const updatedUser = { id: userId, ...updateData };

    // Invalidate cache
    const userCacheKey = this.cacheService.generateKey('user', userId);
    await this.cacheService.del(userCacheKey);

    // Also invalidate related caches
    const activeUsersCacheKey = this.cacheService.generateKey('active-users', updateData.tenantId);
    await this.cacheService.del(activeUsersCacheKey);

    return updatedUser;
  }

  /**
   * Example: Bulk cache operations
   */
  async cacheMultipleUsers(users: any[]) {
    const cachePromises = users.map(user => {
      const cacheKey = this.cacheService.generateKey('user', user.id);
      return this.cacheService.set(cacheKey, user, 300);
    });

    await Promise.all(cachePromises);
    console.log(`Cached ${users.length} users`);
  }

  /**
   * Example: Check if cache exists before expensive operation
   */
  async getReportsWithCache(reportType: string, params: any) {
    const cacheKey = this.cacheService.generateKey('report', reportType, JSON.stringify(params));
    
    const exists = await this.cacheService.has(cacheKey);
    if (exists) {
      console.log('Report found in cache');
      return await this.cacheService.get(cacheKey);
    }

    console.log('Generating report...');
    // Simulate expensive report generation
    const report = {
      type: reportType,
      data: [1, 2, 3, 4, 5],
      generatedAt: new Date().toISOString()
    };

    // Cache for 1 hour
    await this.cacheService.set(cacheKey, report, 3600);
    
    return report;
  }

  /**
   * Example: Clear all cache (use with caution in production)
   */
  async clearAllCache() {
    await this.cacheService.reset();
    console.log('All cache cleared');
  }
} 