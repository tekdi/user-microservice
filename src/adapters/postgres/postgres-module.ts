import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { PostgresUserService } from "./user-adapter";
import { FieldsService } from "src/fields/fields.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user-entity";
import { CohortMembers } from "src/cohortMembers/entities/cohort-member.entity";
import { Fields } from "src/fields/entities/fields.entity";
import { FieldValues } from "src/fields/entities/fields-values.entity";
import { AttendanceEntity } from "src/attendance/entities/attendance.entity";
import { PostgresAttendanceService } from "./attendance-adapter";
import { PostgresFieldsService } from "./fields-adapter";
import { Cohort } from "src/cohort/entities/cohort.entity";
import { UserTenantMapping } from "src/userTenantMapping/entities/user-tenant-mapping.entity";
import { Tenants } from "src/userTenantMapping/entities/tenant.entity";
import { UserRoleMapping } from "src/rbac/assign-role/entities/assign-role.entity";
import { Role } from "src/rbac/role/entities/role.entity";
import { PostgresRoleService } from "./rbac/role-adapter";
import { RolePrivilegeMapping } from "src/rbac/assign-privilege/entities/assign-privilege.entity";
import { NotificationRequest } from "@utils/notification.axios";


@Module({
    imports: [HttpModule,
        TypeOrmModule.forFeature([
            User,
            Fields,
            FieldValues,
            CohortMembers,
            AttendanceEntity,
            Fields,
            Cohort,
            UserTenantMapping,
            Tenants,
            UserRoleMapping,
            Role,
            RolePrivilegeMapping,
        ])
    ],
    providers: [
        PostgresUserService,
        PostgresAttendanceService,
        PostgresFieldsService,
        PostgresRoleService,
        NotificationRequest
    ],
    exports: [
        PostgresUserService,
        PostgresAttendanceService,
        PostgresFieldsService,
        NotificationRequest
    ],
})
export class PostgresModule { }
