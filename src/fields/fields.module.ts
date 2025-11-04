import { Module } from "@nestjs/common";
import { FieldsController } from "./fields.controller";
import { HttpModule } from "@nestjs/axios";
import { FieldsAdapter } from "./fieldsadapter";
import { Fields } from "./entities/fields.entity";
import { FieldValues } from "./entities/fields-values.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { FieldsService } from "./fields.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Fields, FieldValues]),
    HttpModule,
    PostgresModule,
  ],
  controllers: [FieldsController],
  providers: [FieldsAdapter, FieldsService],
  exports: [FieldsService],
})
export class FieldsModule {}
