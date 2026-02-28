import { Module } from "@nestjs/common";
import { AcademicyearsController } from "./academicyears.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AcademicYear } from "./entities/academicyears-entity";
import { AcademicYearService } from "./academicyears.service";
import { Tenant } from "src/tenant/entities/tenent.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AcademicYear, Tenant])],
  providers: [AcademicYearService],
  controllers: [AcademicyearsController],
  exports: [AcademicYearService],
})
export class AcademicyearsModule { }
