import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { ScheduleModule } from "@nestjs/schedule";
import { AttendaceAdapter } from "./attendanceadapter";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AttendanceEntity } from "./entities/attendance.entity";
import { Repository } from "typeorm";
import { PostgresModule } from "src/adapters/postgres/postgres-module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceEntity]),
    PostgresModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AttendanceController],
  providers: [AttendaceAdapter, Repository],
})
export class AttendanceModule {}
