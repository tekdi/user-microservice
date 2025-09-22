import { Injectable } from "@nestjs/common";
import { IServicelocator } from "src/adapters/userservicelocator";
import { PostgresUserService } from "src/adapters/postgres/user-adapter";

@Injectable()
export class UserAdapter {
  constructor(private postgresProvider: PostgresUserService) {}
  buildUserAdapter(): IServicelocator {
    let adapter: IServicelocator;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
    }
    return adapter;
  }
  
  async findUserByIdentifier(identifier: string): Promise<any> {
    const adapter = this.buildUserAdapter();
    return adapter.findUserByIdentifier(identifier);
  }
}
