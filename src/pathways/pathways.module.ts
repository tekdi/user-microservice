import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "../cache/cache.module";
import { ConfigModule } from "@nestjs/config";
import { PathwaysController } from "./pathway/pathways.controller";
import { PathwaysService } from "./pathway/pathways.service";
import { Pathway } from "./pathway/entities/pathway.entity";
import { UserPathwayHistory } from "./pathway/entities/user-pathway-history.entity";
import { User } from "../user/entities/user-entity";
import { TagsController } from "./tags/tags.controller";
import { TagsService } from "./tags/tags.service";
import { Tag } from "./tags/entities/tag.entity";
import { InterestsModule } from "./interests/interests.module";
import { LmsClientService } from "./common/services/lms-client.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Pathway, UserPathwayHistory, User, Tag]),
    InterestsModule,
    ConfigModule,
    CacheModule,
    StorageModule, // Added for S3 file upload support
  ],
  controllers: [PathwaysController, TagsController],
  providers: [PathwaysService, TagsService, LmsClientService],
  exports: [PathwaysService, TagsService],
})
export class PathwaysModule {}
