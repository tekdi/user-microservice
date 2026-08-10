import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country } from '../countries/entities/country.entity';
import { AspireLeadersSpecificController } from './aspire-leaders-specific.controller';
import { AspireLeadersSpecificService } from './aspire-leaders-specific.service';

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [AspireLeadersSpecificController],
  providers: [AspireLeadersSpecificService],
  exports: [AspireLeadersSpecificService],
})
export class AspireLeadersSpecificModule {}
