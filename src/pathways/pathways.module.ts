import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PathwaysController } from './pathway/pathways.controller';
import { PathwaysService } from './pathway/pathways.service';
import { Pathway } from './pathway/entities/pathway.entity';
import { UserPathwayHistory } from './pathway/entities/user-pathway-history.entity';
import { User } from '../user/entities/user-entity';
import { TagsController } from './tags/tags.controller';
import { TagsService } from './tags/tags.service';
import { Tag } from './tags/entities/tag.entity';
import { InterestsModule } from './interests/interests.module';
import { LmsClientService } from './common/services/lms-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pathway, UserPathwayHistory, User, Tag]),
    InterestsModule,
    ConfigModule,
  ],
  controllers: [PathwaysController, TagsController],
  providers: [PathwaysService, TagsService, LmsClientService],
  exports: [PathwaysService, TagsService],
})
export class PathwaysModule { }
