import { Module } from "@nestjs/common";
import { TypeormService } from "./typeorm";
import { DataSource, EntityManager } from "typeorm";

@Module({
  imports: [],
  providers: [TypeormService, EntityManager, DataSource],
  exports: [TypeormService],
})
export class ServicesModule {}
