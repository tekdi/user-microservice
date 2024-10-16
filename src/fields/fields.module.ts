import { CacheModule, Module } from "@nestjs/common";
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
  ],
  controllers: [FieldsController],
  providers: [FieldsAdapter],
})
export class FieldsModule {}
