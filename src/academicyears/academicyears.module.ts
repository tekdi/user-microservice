import { Module } from "@nestjs/common";
import { AcademicyearsController } from "./academicyears.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcademicYear } from "./entities/academicyears-entity";
import { AcademicYearService } from "./academicyears.service";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear, Tenants])],
  providers: [AcademicYearService],
  controllers: [AcademicyearsController],
  exports: [AcademicYearService],
})
export class AcademicyearsModule { }
