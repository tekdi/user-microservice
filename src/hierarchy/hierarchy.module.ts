import { Module } from '@nestjs/common';
import { CacheModule } from 'src/cache/cache.module';
import { HierarchyController } from './hierarchy.controller';
import { HierarchyService } from './hierarchy.service';
import { ScopeCacheSubscriber } from './scope-cache.subscriber';

/** Task 17 (Swadhaar): reviewer scope, GET hierarchy/my-scope */
@Module({
  imports: [CacheModule],
  controllers: [HierarchyController],
  providers: [HierarchyService, ScopeCacheSubscriber],
  exports: [HierarchyService],
})
export class HierarchyModule {}
