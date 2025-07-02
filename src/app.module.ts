import { Module } from "@nestjs/common";
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
import { AttendanceModule } from "./attendance/attendance.module";
import { UserModule } from "./user/user.module";
import { RbacModule } from "./rbac/rbac.module";
import { AssignTenantModule } from "./userTenantMapping/user-tenant-mapping.module";
import { FormsModule } from "./forms/forms.module";
import { HttpService } from "@utils/http-service";
import { TenantModule } from "./tenant/tenant.module";
import { AcademicyearsModule } from "./academicyears/academicyears.module";
import { CohortAcademicYearModule } from "./cohortAcademicYear/cohortAcademicYear.module";
import { AutomaticMemberModule } from "./automatic-member/automatic-member.module";
import { PermissionMiddleware } from "./middleware/permission.middleware";
import { RolePermissionModule } from "./permissionRbac/rolePermissionMapping/role-permission.module";
import { LocationModule } from "./location/location.module";
import { KafkaModule } from "./kafka/kafka.module";
import kafkaConfig from "./kafka/kafka.config";
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
    AttendanceModule,
    CohortModule,
    CohortMembersModule,
    AssignTenantModule,
    FieldsModule,
    AuthModule,
    AuthRbacModule,
    DatabaseModule,
    FormsModule,
    TenantModule,
    AcademicyearsModule,
    CohortAcademicYearModule,
    AutomaticMemberModule,
    RolePermissionModule,
    LocationModule,
    KafkaModule,
  ],
  controllers: [AppController],
  providers: [AppService, HttpService],
})
export class AppModule {}
