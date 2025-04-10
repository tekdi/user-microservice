import { Injectable } from "@nestjs/common";
import { IServicelocatorfields } from "src/adapters/fieldsservicelocator";
import { PostgresFieldsService } from "src/adapters/postgres/fields-adapter";

@Injectable()
export class FieldsAdapter {
  constructor(private postgresProvider: PostgresFieldsService) {}
  buildFieldsAdapter(): IServicelocatorfields {
    let adapter: IServicelocatorfields;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
        break;
    }
    return adapter;
  }
}
