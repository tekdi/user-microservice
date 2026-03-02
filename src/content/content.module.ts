import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { Content } from './entities/content.entity';
import { ContentType } from './entities/content-type.entity';
import { ContentTagMap } from './entities/content-tag-map.entity';
import { Tag } from '../pathways/tags/entities/tag.entity';
import { CacheModule } from '../cache/cache.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, ContentType, ContentTagMap, Tag]),
    CacheModule,
    ConfigModule,
  ],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
