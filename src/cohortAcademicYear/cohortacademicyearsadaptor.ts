import { Injectable } from "@nestjs/common";
import { IServiceLocatorCohortAcademicYear } from "src/adapters/cohortacademicyearservicelocator";
import { CohortAcademicYearService } from "src/adapters/postgres/cohortAcademicYear-adapter";

@Injectable()
export class CohortAcademicYearAdapter {
  constructor(private readonly postgresProviders: CohortAcademicYearService) {}
  buildAcademicYears(): IServiceLocatorCohortAcademicYear {
    let adapter: IServiceLocatorCohortAcademicYear;
    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProviders;
    }
    return adapter;
  }
}
