import { Module } from "@nestjs/common";
import { FormsService } from "./forms.service";
import { FormsController } from "./forms.controller";
import { Form } from "./entities/form.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Fields } from "src/fields/entities/fields.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { FieldsModule } from "src/fields/fields.module";

@Module({
  controllers: [FormsController],
  imports: [
    TypeOrmModule.forFeature([Form, Fields, FieldValues]),
    FieldsModule,
  ],
  providers: [FormsService],
  exports: [FormsService]
})
export class FormsModule {}
