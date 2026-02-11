import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InterestController } from "./interest.controller";
import { InterestService } from "./interest.service";
import { Interest } from "./entities/interest.entity";
import { Pathway } from "../entities/pathway.entity";
import { UserPathwayHistory } from "../entities/user-pathway-history.entity";
import { UserPathwayInterests } from "../entities/user-pathway-interests.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Interest,
      Pathway,
      UserPathwayHistory,
      UserPathwayInterests,
    ]),
  ],
  controllers: [InterestController],
  providers: [InterestService],
  exports: [InterestService],
})
export class InterestModule { }
