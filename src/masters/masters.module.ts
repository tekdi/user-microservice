import { Module } from '@nestjs/common';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';

/** Swadhaar admin portal: Org Management and Branch Management (no deletes; deactivate). */
@Module({
  controllers: [OrganisationController, BranchController],
  providers: [OrganisationService, BranchService],
})
export class MastersModule {}
