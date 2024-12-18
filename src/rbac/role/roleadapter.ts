import { Injectable } from "@nestjs/common";
import { IServicelocatorRbac } from "../../adapters/rbacservicelocator";
import { PostgresRoleService } from "../../adapters/postgres/rbac/role-adapter";

@Injectable()
export class RoleAdapter {
  constructor(private postgresProvider: PostgresRoleService) {}
  buildRbacAdapter(): IServicelocatorRbac {
    let adapter: IServicelocatorRbac;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
    }
    return adapter;
  }
}
