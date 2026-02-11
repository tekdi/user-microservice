import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PathwaysController } from './pathway/pathways.controller';
import { PathwaysService } from './pathway/pathways.service';
import { Pathway } from './pathway/entities/pathway.entity';
import { TagsController } from './tags/tags.controller';
import { TagsService } from './tags/tags.service';
import { Tag } from './tags/entities/tag.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pathway, Tag])],
  controllers: [PathwaysController, TagsController],
  providers: [PathwaysService, TagsService],
  exports: [PathwaysService, TagsService],
})
export class PathwaysModule {}

