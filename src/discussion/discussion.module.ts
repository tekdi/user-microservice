import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { DiscussionMessage } from './entities/discussion-message.entity';

/**
 * Discussion Module
 * 
 * This is a reusable module for group discussions.
 * 
 * To use this module:
 * 1. Import DiscussionModule in your AppModule
 * 2. Provide a GroupMemberRepository implementation (see providers below)
 * 3. Ensure your Group and GroupMember entities are properly set up
 * 4. Run the migration to create the discussion_messages table
 * 
 * Example usage in AppModule:
 * 
 * @Module({
 *   imports: [
 *     TypeOrmModule.forFeature([DiscussionMessage, Group, GroupMember]),
 *     DiscussionModule,
 *   ],
 *   providers: [
 *     {
 *       provide: 'GroupMemberRepository',
 *       useClass: YourGroupMemberRepositoryService,
 *     },
 *   ],
 * })
 * export class AppModule {}
 */
@Module({
  imports: [TypeOrmModule.forFeature([DiscussionMessage])],
  controllers: [DiscussionController],
  providers: [
    DiscussionService,
  ],
  exports: [DiscussionService],
})
export class DiscussionModule {}

