import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fields } from './entities/fields.entity';
import { FieldValues } from './entities/fields-values.entity';
import { FieldsService } from './fields.service';
import { FormsModule } from '../forms/forms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Fields]),
    TypeOrmModule.forFeature([FieldValues]),
    FormsModule // Import FormsModule to get access to FormsService
  ],
  providers: [
    FieldsService,
    {
      provide: 'FIELD_OPERATIONS',
      useExisting: FieldsService
    }
  ],
  exports: [FieldsService, 'FIELD_OPERATIONS']
})
export class FieldOperationsModule {} 