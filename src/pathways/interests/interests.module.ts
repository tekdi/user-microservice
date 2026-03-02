import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { InterestsController } from "./interests.controller";
import { InterestsService } from "./interests.service";
import { Interest } from "./entities/interest.entity";
import { Pathway } from "../pathway/entities/pathway.entity";
import { UserPathwayHistory } from "../pathway/entities/user-pathway-history.entity";
import { UserPathwayInterests } from "../pathway/entities/user-pathway-interests.entity";
import { CacheModule } from "src/cache/cache.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Interest,
      Pathway,
      UserPathwayHistory,
      UserPathwayInterests,
    ]),
    ConfigModule,
    CacheModule,
  ],
  controllers: [InterestsController],
  providers: [InterestsService],
  exports: [InterestsService],
})
export class InterestsModule { }
