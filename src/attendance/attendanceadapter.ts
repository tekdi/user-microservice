import { Injectable } from "@nestjs/common";
import { IServicelocator } from "src/adapters/attendanceservicelocator";
import { PostgresAttendanceService } from "src/adapters/postgres/attendance-adapter";

@Injectable()
export class AttendaceAdapter {
  constructor(private postgresProvider: PostgresAttendanceService) {}
  buildAttenceAdapter(): IServicelocator {
    let adapter: IServicelocator;

    switch (process.env.ADAPTERSOURCE) {
      case "postgres":
        adapter = this.postgresProvider;
        break;
    }
    return adapter;
  }
}
