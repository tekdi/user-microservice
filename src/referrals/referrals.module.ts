import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralEntity } from './entities/referral-entity.entity';
import { ReferralSlugHistory } from './entities/referral-slug-history.entity';
import { UserAttribution } from './entities/user-attribution.entity';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { User } from '../user/entities/user-entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralEntity, ReferralSlugHistory, UserAttribution, User]),
    ConfigModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}

