import { Injectable } from "@nestjs/common";
import { IServicelocatorAcademicyear } from "src/adapters/academicyearsservicelocater";
import { PostgresAcademicYearService } from "src/adapters/postgres/academicyears-adapter";

@Injectable()
export class AcademicYearAdapter {
  constructor(
    private readonly postgresProviders: PostgresAcademicYearService
  ) {}
  buildAcademicYears(): IServicelocatorAcademicyear {
    let adapter: IServicelocatorAcademicyear;
    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProviders;
    }
    return adapter;
  }
}
