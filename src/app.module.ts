import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { AssignTenantModule } from "./userTenantMapping/user-tenant-mapping.module";
import { FormsModule } from "./forms/forms.module";
import { HttpService } from "@utils/http-service";
import { TenantModule } from "./tenant/tenant.module";
import { AcademicyearsModule } from "./academicyears/academicyears.module";
import { CohortAcademicYearModule } from "./cohortAcademicYear/cohortAcademicYear.module";
import { ServicesModule } from "./services/services.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Tenant } from "./tenant/entities/tenent.entity";

@Module({
  imports: [
    // TypeOrmModule.forRootAsync({
    //   useFactory: async (configService: ConfigService) => ({
    //     type: "postgres", // Replace with your DB type, e.g., 'mysql', 'postgres'
    //     host: configService.get("DATABASE_HOST"),
    //     port: configService.get("DATABASE_PORT"),
    //     username: configService.get("DATABASE_USERNAME"),
    //     password: configService.get("DATABASE_PASSWORD"),
    //     database: configService.get("DATABASE_NAME"),
    //     entities: [Tenant], // Register your entities here
    //     synchronize: true, // Set to true for development, false for production
    //   }),
    //   inject: [ConfigService], // Inject ConfigService here to make it available to the factory
    // }),
    //TypeOrmModule.forFeature([Tenant]), // Register the repositories for your entities
    RbacModule,
    ConfigModule.forRoot({ isGlobal: true }),
    // MulterModule.register({
    //   dest: "./uploads",
    // }),
    UserModule,
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
    ServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService, HttpService],
})
export class AppModule {}
