import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CacheModule } from "src/cache/cache.module";
import { ConnectController } from "./connect.controller";
import { ConnectAdminController } from "./connect-admin.controller";
import { ConnectService } from "./connect.service";
import { SafetyReportService } from "./safety-report.service";
import { ConnectAdminGuard } from "./guards/connect-admin.guard";
import { ConnectAdminService } from "./connect-admin.service";
import { ConnectEnrichmentService } from "./connect-enrichment.service";
import { ConnectCareerDomain } from "./entities/connect-career-domain.entity";
import { ConnectCareerDomainGroup } from "./entities/connect-career-domain-group.entity";
import { SupportOfferingType } from "./entities/support-offering-type.entity";
import { ConnectProfile } from "./entities/connect-profile.entity";
import { ConnectLinkedinClick } from "./entities/connect-linkedin-click.entity";
import { SafetyReport } from "./entities/safety-report.entity";

/**
 * Aspire Connect (ELP member directory).
 * Owns the connect_* tables, support_offering_types and safety_reports.
 * Users, FieldValues, user_pathways, CohortMembers and Cohort are read live
 * (read-only SQL) by ConnectService (list filters / search) and
 * ConnectEnrichmentService (card details).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConnectCareerDomainGroup,
      ConnectCareerDomain,
      SupportOfferingType,
      ConnectProfile,
      ConnectLinkedinClick,
      SafetyReport,
    ]),
    CacheModule,
  ],
  controllers: [ConnectController, ConnectAdminController],
  providers: [
    ConnectService,
    SafetyReportService,
    ConnectEnrichmentService,
    ConnectAdminService,
    ConnectAdminGuard,
  ],
})
export class ConnectModule {}
