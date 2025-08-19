import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LocationService } from "./location.service";
import { LocationController } from "./location.controller";
import { Location } from "./entities/location.entity";
import { State } from "./entities/state.entity";
import { District } from "./entities/district.entity";
import { Block } from "./entities/block.entity";
import { Village } from "./entities/village.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Location,    // Legacy entity for backward compatibility
      State,       // New hierarchy entities
      District,
      Block,
      Village
    ])
  ],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
