import { Injectable } from "@nestjs/common";
import { PostgresAssignPrivilegeService } from "src/adapters/postgres/rbac/privilegerole.adapter";
import { IServicelocatorprivilegeRole } from "src/adapters/assignprivilegelocater";

@Injectable()
export class AssignPrivilegeAdapter {
  constructor(private postgresProvider: PostgresAssignPrivilegeService) {}
  buildPrivilegeRoleAdapter(): IServicelocatorprivilegeRole {
    let adapter: IServicelocatorprivilegeRole;

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
