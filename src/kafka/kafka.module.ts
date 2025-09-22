import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaService } from './kafka.service';
import { FieldValues } from '../fields/entities/fields-values.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([FieldValues])
  ],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {} 