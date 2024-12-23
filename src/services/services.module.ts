import { Module } from "@nestjs/common";
import { TypeormService } from "./typeorm";
import { EntityManager } from "typeorm";

@Module({
  imports: [],
  providers: [TypeormService, EntityManager],
  exports: [TypeormService],
})
export class ServicesModule {}
