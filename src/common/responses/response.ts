import { v4 } from "uuid";
import { Params } from "./response-interface";
import { Response } from "express";
export default class APIResponse {
  public static success<Type>(
    response: Response,
    id: string,
    result: Type,
    statusCode: number,
    successmessage: string
  ) {
    try {
      const params: Params = {
        resmsgid: v4(),
        status: "successful",
        err: null,
        errmsg: null,
        successmessage: successmessage,
      };
      const resObj = {
        id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params,
        responseCode: statusCode,
        result,
      };
      return response.status(statusCode).json(resObj);
    } catch (e) {
      return e;
    }
  }
  public static error(
    response: Response,
    id: string,
    errmsg: string,
    error: string,
    statusCode: number
  ) {
    try {
      const params: Params = {
        resmsgid: v4(),
        status: "failed",
        err: error,
        errmsg: errmsg,
      };
      const resObj = {
        id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params,
        responseCode: statusCode,
        result: {},
      };
      return response.status(statusCode).json(resObj);
    } catch (e) {
      return e;
    }
  }
}
