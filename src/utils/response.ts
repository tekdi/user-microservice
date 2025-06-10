import { v4 } from "uuid";
import { ServerResponse, Params } from "./response-interface";

export default class APIResponse {
  public static success<Type>(
    id: string,
    result: Type,
    statusCode: string
  ): ServerResponse {
    try {
      const params: Params = {
        resmsgid: v4(),
        status: "successful",
        err: null,
        errmsg: null,
      };

      const resObj: ServerResponse = {
        id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params,
        responseCode: statusCode,
        result,
      };
      return resObj;
    } catch (e) {
      return e;
    }
  }

  public static error(
    id: string,
    errmsg: string,
    error: string,
    statusCode: string
  ): ServerResponse {
    try {
      const params: Params = {
        resmsgid: v4(),
        status: "failed",
        err: error,
        errmsg: errmsg,
      };

      const resObj: ServerResponse = {
        id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params,
        responseCode: statusCode,
        result: { success: false },
      };
      return resObj;
    } catch (e) {
      return e;
    }
  }

  public static search(dtoFileName) {
    let { limit, page, filters } = dtoFileName;

    // Ensure limit and page are numbers with defaults
    limit = typeof limit === 'number' ? limit : (Number(limit) || 10);
    page = typeof page === 'number' ? page : (Number(page) || 1);
    
    // Calculate offset
    let offset = 0;
    if (page > 1) {
      offset = limit * (page - 1);
    }

    // Build where clause
    const whereClause = {};
    if (filters && Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([key, value]) => {
        whereClause[key] = value;
      });
    }
    return { offset, limit, whereClause };
  }

  //   public static handleBadRequests(
  //     response: Response,
  //     apiId: string,
  //     errmsg: string,
  //     error: string,
  //   ) {
  //     return response
  //       .status(HttpStatus.BAD_REQUEST)
  //       .json(APIResponse.error(apiId, errmsg, error, 'BAD_REQUEST'));
  //   }
}
