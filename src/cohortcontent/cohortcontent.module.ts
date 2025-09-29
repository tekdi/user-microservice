import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CohortcontentController } from "./cohortcontent.controller";
import { CohortContentService } from "./cohortcontent.service";
import { CohortContent } from "./entities/cohort-content.entity";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { Tenant } from "src/tenant/entities/tenent.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([CohortContent, Cohort, Tenant]),
  ],
  controllers: [CohortcontentController],
  providers: [CohortContentService],
  exports: [CohortContentService],
})
export class CohortcontentModule {}


