import { Controller, Get } from "@nestjs/common";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get("health")
  async getHealth() {
    let dbHealthy = false;

    try {
      // Check database connectivity with a simple query
      await this.dataSource.query("SELECT 1");
      dbHealthy = true;
    } catch (error) {
      dbHealthy = false;
    }

    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "ZZ");

    return {
      id: "api.content.health",
      ver: "3.0",
      ts: timestamp,
      params: {
        resmsgid: uuidv4(),
        msgid: null,
        err: null,
        status: "successful",
        errmsg: null,
      },
      responseCode: "OK",
      result: {
        checks: [{ name: "postgres db", healthy: dbHealthy }],
        healthy: dbHealthy,
      },
    };
  }
}
