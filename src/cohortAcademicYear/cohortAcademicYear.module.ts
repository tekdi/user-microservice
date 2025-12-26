import { Module } from "@nestjs/common";
import { CohortAcademicYear } from "./entities/cohortAcademicYear.entity";
import { CohortAcademicYearService } from "./cohortAcademicYear.service";
import { CohortAcademicYearController } from "./cohortAcademicYear.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { Tenant } from "src/tenant/entities/tenent.entity";
import { AcademicyearsModule } from "src/academicyears/academicyears.module";


@Module({
  imports: [
    AcademicyearsModule,
    TypeOrmModule.forFeature([
      CohortAcademicYear,
      Cohort,
      AcademicYear,
      Tenant
    ]),
  ],
  controllers: [CohortAcademicYearController],
  providers: [CohortAcademicYearService],
  exports: [CohortAcademicYearService]
})
export class CohortAcademicYearModule { }
