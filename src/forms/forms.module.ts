import { Module } from "@nestjs/common";
import { FormsService } from "./forms.service";
import { FormsController } from "./forms.controller";
import { Form } from "./entities/form.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PostgresFieldsService } from "src/adapters/postgres/fields-adapter";
import { Fields } from "src/fields/entities/fields.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { TypeormService } from "src/services/typeorm";

@Module({
  controllers: [FormsController],
  imports: [TypeOrmModule.forFeature([Form, Fields, FieldValues])],
  providers: [FormsService, PostgresFieldsService, TypeormService],
})
export class FormsModule { }
