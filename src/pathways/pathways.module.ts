import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PathwaysController } from "./pathways.controller";
import { PathwaysService } from "./pathways.service";
import { Pathway } from "./entities/pathway.entity";
import { UserPathwayHistory } from "./entities/user-pathway-history.entity";
import { User } from "../user/entities/user-entity";
import { InterestModule } from "./interest/interest.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Pathway, UserPathwayHistory, User]),
    InterestModule,
  ],
  controllers: [PathwaysController],
  providers: [PathwaysService],
  exports: [PathwaysService],
})
export class PathwaysModule { }
