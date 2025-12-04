import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import { isUUID } from "class-validator";

export const GetTenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.headers.tenantid;

    // Check if tenantId is present
    if (!tenantId) {
      throw new BadRequestException("tenantid header is required");
    }

    // Check if tenantId is a non-empty string
    if (typeof tenantId !== "string" || tenantId.trim().length === 0) {
      throw new BadRequestException("tenantid must be a non-empty string");
    }

    // Check if tenantId is a valid UUID format
    if (!isUUID(tenantId)) {
      throw new BadRequestException("tenantid must be a valid UUID format");
    }

    return tenantId;
  }
);
