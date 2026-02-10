import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PathwaysController } from './pathways.controller';
import { PathwaysService } from './pathways.service';
import { Pathway } from './entities/pathway.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pathway])],
  controllers: [PathwaysController],
  providers: [PathwaysService],
  exports: [PathwaysService],
})
export class PathwaysModule {}

