import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { CacheService } from 'src/cache/cache.service';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
import { Cohort } from 'src/cohort/entities/cohort.entity';
import { UserRoleMapping } from 'src/rbac/assign-role/entities/assign-role.entity';
import { MY_SCOPE_CACHE_PREFIX } from './hierarchy.service';

const WATCHED = [CohortMembers, Cohort, UserRoleMapping];

/**
 * Task 17: clears every cached my-scope when a group membership, group role, group (status,
 * parent) or tenant role changes. Scope is transitive (a change in one group can change an
 * ARM's scope two levels up), so all scope keys go, not only the members'. A bulk enrol fires
 * one event per row; they are folded into one clear per tick.
 */
@Injectable()
export class ScopeCacheSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(ScopeCacheSubscriber.name);
  private clearQueued = false;

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly cacheService: CacheService
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<any>) {
    this.onChange(event.metadata?.target);
  }

  afterUpdate(event: UpdateEvent<any>) {
    this.onChange(event.metadata?.target);
  }

  afterRemove(event: RemoveEvent<any>) {
    this.onChange(event.metadata?.target);
  }

  private onChange(target: unknown) {
    if (!WATCHED.includes(target as any) || this.clearQueued) return;
    this.clearQueued = true;
    setImmediate(() => {
      this.clearQueued = false;
      this.cacheService
        .delByPattern(`${MY_SCOPE_CACHE_PREFIX}*`)
        .catch((e) => this.logger.warn(`Could not clear my-scope cache: ${e?.message}`));
    });
  }
}
