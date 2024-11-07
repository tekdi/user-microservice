import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { Tenants } from 'src/tenant/entities/tenent.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenants])
  ],
  controllers: [TenantController],
  providers: [TenantService]
})
export class TenantModule { }
