import { Injectable } from "@nestjs/common";
import { IServicelocatorcohortMembers } from "src/adapters/cohortMembersservicelocator";
import { PostgresCohortMembersService } from "src/adapters/postgres/cohortMembers-adapter";

@Injectable()
export class CohortMembersAdapter {
  constructor(private postgresProvider: PostgresCohortMembersService) {}
  buildCohortMembersAdapter(): IServicelocatorcohortMembers {
    let adapter: IServicelocatorcohortMembers;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
    }
    return adapter;
  }
}
