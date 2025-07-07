import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fields } from '../fields/entities/fields.entity';
import { FieldValues } from '../fields/entities/fields-values.entity';
import { FieldsService } from '../fields/fields.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Fields]),
    TypeOrmModule.forFeature([FieldValues])
  ],
  providers: [FieldsService],
  exports: [FieldsService]
})
export class SharedModule {} 