import { Injectable } from "@nestjs/common";
import { PostgresAssignroleService } from "src/adapters/postgres/rbac/assignrole-adapter";
import { IServicelocatorassignRole } from "src/adapters/assignroleservicelocater";

@Injectable()
export class AssignRoleAdapter {
  constructor(private postgresProvider: PostgresAssignroleService) {}
  buildassignroleAdapter(): IServicelocatorassignRole {
    let adapter: IServicelocatorassignRole;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
        break;
      default:
        throw new Error(
          "Invalid ADAPTERSOURCE environment variable. Please specify either 'hasura' or 'postgres'.",
        );
    }
    return adapter;
  }
}
