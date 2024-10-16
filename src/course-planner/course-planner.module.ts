import { Module } from "@nestjs/common";
import { CoursePlannerService } from "./course-planner.service";
import { CoursePlannerController } from "./course-planner.controller";
import { HttpService } from "@utils/http-service";

@Module({
  controllers: [CoursePlannerController],
  providers: [CoursePlannerService, HttpService],
})
export class CoursePlannerModule {}
