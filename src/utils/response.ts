import { v4 as uuidv4 } from "uuid";
import { HttpStatus } from "@nestjs/common";

// Response structure interface
export interface ServerResponse<T = any> {
  id: string;
  params: Params;
  responseCode: number;
  result: T;
  ts: string;
  ver: string;
}

export interface Params {
  resmsgid: string;
  err?: string;
  status: "successful" | "failed";
  errmsg?: string;
}

export default class APIResponse {
  public static search(dtoFileName) {
    let { limit } = dtoFileName;
    const { page, filters } = dtoFileName;

    let offset = 0;
    if (page > 1) {
      offset = parseInt(limit) * (page - 1);
    }

    if (limit.trim() === "") {
      limit = "0";
    }

    const whereClause = {};
    if (filters && Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([key, value]) => {
        whereClause[key] = value;
      });
    }
    return { offset, limit, whereClause };
  }
  private static readonly API_VERSION = "1.0"; // Set version as a constant

  public static success<T>(
    id: string,
    result: T,
    statusCode: HttpStatus = HttpStatus.OK,
  ): ServerResponse<T> {
    return {
      id,
      ver: APIResponse.API_VERSION,
      ts: new Date().toISOString(),
      params: {
        resmsgid: uuidv4(),
        status: "successful",
        err: null,
        errmsg: null,
      },
      responseCode: statusCode,
      result,
    };
  }

  public static error(
    id: string,
    errmsg: string,
    errorCode: string,
    statusCode: HttpStatus,
  ): ServerResponse {
    return {
      id,
      ver: APIResponse.API_VERSION,
      ts: new Date().toISOString(),
      params: {
        resmsgid: uuidv4(),
        status: "failed",
        err: errorCode,
        errmsg,
      },
      responseCode: statusCode,
      result: { success: false },
    };
  }
}
