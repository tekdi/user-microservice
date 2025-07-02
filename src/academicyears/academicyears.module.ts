import { Module } from "@nestjs/common";
import { AcademicyearsController } from "./academicyears.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcademicYear } from "./entities/academicyears-entity";
import { AcademicYearAdapter } from "./academicyearsadaptor";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear, Tenants])],
  providers: [AcademicYearAdapter, PostgresAcademicYearService],
  controllers: [AcademicyearsController],
})
export class AcademicyearsModule { }
