import { Module } from "@nestjs/common";
import { CohortAcademicYear } from "./entities/cohortAcademicYear.entity";
import { CohortAcademicYearService } from "../adapters/postgres/cohortAcademicYear-adapter";
import { CohortAcademicYearController } from "./cohortAcademicYear.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CohortAcademicYearAdapter } from "./cohortacademicyearsadaptor";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { AcademicYear } from "src/academicyears/entities/academicyears-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";


@Module({
  imports: [
    PostgresModule,
    TypeOrmModule.forFeature([
      CohortAcademicYear,
      Cohort,
      AcademicYear,
      Tenants
    ]),
  ],
  controllers: [CohortAcademicYearController],
  providers: [CohortAcademicYearAdapter, CohortAcademicYearService, PostgresAcademicYearService],
  exports: [CohortAcademicYearService]
})
export class CohortAcademicYearModule { }
