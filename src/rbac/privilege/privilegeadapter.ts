import { Injectable } from "@nestjs/common";
import { IServicelocator } from "src/adapters/privilegeservicelocator";
import { PostgresPrivilegeService } from "src/adapters/postgres/rbac/privilege-adapter";

@Injectable()
export class PrivilegeAdapter {
  constructor(private postgresProvider: PostgresPrivilegeService) {}
  buildPrivilegeAdapter(): IServicelocator {
    let adapter: IServicelocator;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
    }
    return adapter;
  }
}
