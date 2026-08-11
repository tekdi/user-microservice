import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { Response, Request } from "express";
import APIResponse from "../responses/response";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly apiId?: string) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // If the response was already flushed (e.g. the service/controller already
    // called APIResponse.success/error), there is nothing left to do — attempting
    // to write again is exactly what causes ERR_HTTP_HEADERS_SENT.
    if (response.headersSent) {
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const errorMessage =
      exception instanceof HttpException
        ? (exceptionResponse as any).message || exception.message
        : "Internal server error";
    const detailedErrorMessage = `${errorMessage}`;
    APIResponse.error(
      response,
      this.apiId,
      detailedErrorMessage,
      exception instanceof HttpException
        ? exception.name
        : "Internal Server Error", // error
      status
    );
  }
}
