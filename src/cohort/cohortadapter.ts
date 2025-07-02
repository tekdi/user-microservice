import { Injectable } from "@nestjs/common";
import { IServicelocatorcohort } from "src/adapters/cohortservicelocator";
import { PostgresCohortService } from "src/adapters/postgres/cohort-adapter";

@Injectable()
export class CohortAdapter {
  constructor(private postgresProvider: PostgresCohortService) {}
  buildCohortAdapter(): IServicelocatorcohort {
    let adapter: IServicelocatorcohort;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
        break;
    }
    return adapter;
  }
}
