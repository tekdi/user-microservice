import { Module } from "@nestjs/common";
import { AcademicyearsController } from "./academicyears.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcademicYear } from "./entities/academicyears-entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { AcademicYearService } from "./academicyears.service";

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear, Tenants])],
  providers: [AcademicYearService],
  controllers: [AcademicyearsController],
  exports: [AcademicYearService]
})
export class AcademicyearsModule { }
 