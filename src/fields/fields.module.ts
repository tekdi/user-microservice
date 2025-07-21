import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { FieldsController } from "./fields.controller";
import { HttpModule } from "@nestjs/axios";
import { FieldsAdapter } from "./fieldsadapter";
import { Fields } from "./entities/fields.entity";
import { FieldValues } from "./entities/fields-values.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PostgresModule } from "src/adapters/postgres/postgres-module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Fields]),
    TypeOrmModule.forFeature([FieldValues]),
    HttpModule,
    PostgresModule,
    CacheModule.register({
      ttl: 300, // Cache TTL in seconds (5 minutes)
      max: 100, // Maximum number of items in cache
    }),
  ],
  controllers: [FieldsController],
  providers: [FieldsAdapter],
})
export class FieldsModule {}
