import { applyDecorators } from "@nestjs/common";
import {
  ApiHeader,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from "@nestjs/swagger";

/**
 * Common API decorators for authentication headers and standard error responses
 * Reusable across controllers to avoid duplication
 */
export function ApiCommonHeaders() {
  return applyDecorators(
    ApiHeader({
      name: "Authorization",
      description: "Bearer token for authentication",
      required: true,
    }),
    ApiHeader({
      name: "tenantid",
      description: "Tenant UUID",
      required: true,
    })
  );
}

/**
 * Common API error responses decorator
 * Reusable across endpoints to avoid duplication
 */
export function ApiCommonErrorResponses() {
  return applyDecorators(
    ApiBadRequestResponse({ description: "Bad Request - Invalid UUID format" }),
    ApiUnauthorizedResponse({ description: "Unauthorized" }),
    ApiNotFoundResponse({ description: "Resource not found" }),
    ApiInternalServerErrorResponse({ description: "Internal Server Error" })
  );
}

/**
 * Common API decorators for get-by-id endpoints
 * Combines headers and error responses
 */
export function ApiGetByIdCommon() {
  return applyDecorators(ApiCommonHeaders(), ApiCommonErrorResponses());
}
