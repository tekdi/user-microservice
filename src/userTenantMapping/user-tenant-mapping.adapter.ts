import { Injectable } from "@nestjs/common";
import { PostgresAssignTenantService } from "src/adapters/postgres/userTenantMapping-adapter";
import { IServicelocatorAssignTenant } from "src/adapters/usertenantmappinglocator";

@Injectable()
export class AssignTenantAdapter {
  constructor(private postgresProvider: PostgresAssignTenantService) {}
  buildAssignTenantAdapter(): IServicelocatorAssignTenant {
    let adapter: IServicelocatorAssignTenant;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
        break;
      default:
        throw new Error(
          "Invalid ADAPTERSOURCE environment variable. Please specify either 'hasura' or 'postgres'."
        );
    }
    return adapter;
  }
}
