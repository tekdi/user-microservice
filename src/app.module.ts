import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
// import { MulterModule } from "@nestjs/platform-express/multer";
// Below modules not in use for Shiksha 2.0

/*
import { ConfigurationModule } from "./configs/configuration.module";
*/
// In use for Shiksha 2.0
import { DatabaseModule } from "./common/database.module";
import { AuthModule } from "./auth/auth.module";
import { AuthRbacModule } from "./authRbac/authRbac.module";
import { CohortModule } from "./cohort/cohort.module";
import { CohortMembersModule } from "./cohortMembers/cohortMembers.module";
import { FieldsModule } from "./fields/fields.module";
import { UserModule } from "./user/user.module";
import { RbacModule } from "./rbac/rbac.module";
import { FormsModule } from "./forms/forms.module";
import { HttpService } from "@utils/http-service";
import { TenantModule } from "./tenant/tenant.module";
import { AcademicyearsModule } from "./academicyears/academicyears.module";
import { CohortAcademicYearModule } from "./cohortAcademicYear/cohortAcademicYear.module";
import { AutomaticMemberModule } from "./automatic-member/automatic-member.module";
import { LocationModule } from "./location/location.module";
import { KafkaModule } from "./kafka/kafka.module";
import kafkaConfig from "./kafka/kafka.config";
import { HealthController } from "./health.controller";
import { CohortcontentModule } from "./cohortcontent/cohortcontent.module";
import { UserTenantMappingModule } from "./userTenantMapping/user-tenant-mapping.module";
import { DiscussionModule } from "./discussion";

@Module({
  imports: [
    RbacModule,
    ConfigModule.forRoot({
      load: [kafkaConfig], // Load the Kafka config
      isGlobal: true, // Makes config accessible globally
    }),
    // MulterModule.register({
    //   dest: "./uploads",
    // }),
    UserModule,
    CohortModule,
    CohortMembersModule,
    UserTenantMappingModule,
    FieldsModule,
    AuthModule,
    AuthRbacModule,
    DatabaseModule,
    FormsModule,
    TenantModule,
    AcademicyearsModule,
    CohortAcademicYearModule,
    AutomaticMemberModule,
    LocationModule,
    KafkaModule,
    CohortcontentModule,
    DiscussionModule
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, HttpService],
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(PermissionMiddleware).forRoutes("*"); // Apply middleware to the all routes
  // }
}
