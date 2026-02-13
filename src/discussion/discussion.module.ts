import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { DiscussionMessage } from './entities/discussion-message.entity';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DiscussionMessage, CohortMembers])],
  controllers: [DiscussionController],
  providers: [
    DiscussionService,
  ],
  exports: [DiscussionService],
})
export class DiscussionModule {}

