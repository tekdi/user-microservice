import { Module } from "@nestjs/common";
import { CohortMembersController } from "./cohortMembers.controller";
import { HttpModule } from "@nestjs/axios";
import { CohortMembersAdapter } from "./cohortMembersadapter";
import { HasuraModule } from "src/adapters/hasura/hasura.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CohortMembers } from "./entities/cohort-member.entity";
import { PostgresModule } from "src/adapters/postgres/postgres-module";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";
import { HasuraCohortMembersService } from "src/adapters/hasura/cohortMembers.adapter";
import { Fields } from "src/fields/entities/fields.entity";
import { User } from "src/user/entities/user-entity";
import { Cohort } from "src/cohort/entities/cohort.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([CohortMembers, Fields, User, Cohort]),
    HttpModule,
    HasuraModule,
    PostgresModule,
  ],
  controllers: [CohortMembersController],
  providers: [
    CohortMembersAdapter,
    PostgresCohortMembersService,
    HasuraCohortMembersService,
  ],
})
export class CohortMembersModule { }