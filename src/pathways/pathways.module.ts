import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PathwaysController } from './pathway/pathways.controller';
import { PathwaysService } from './pathway/pathways.service';
import { Pathway } from './pathway/entities/pathway.entity';
import { TagsController } from './tags/tags.controller';
import { TagsService } from './tags/tags.service';
import { Tag } from './tags/entities/tag.entity';
import { LmsClientService } from './common/services/lms-client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pathway, Tag]), ConfigModule],
  controllers: [PathwaysController, TagsController],
  providers: [PathwaysService, TagsService, LmsClientService],
  exports: [PathwaysService, TagsService],
})
export class PathwaysModule {}

