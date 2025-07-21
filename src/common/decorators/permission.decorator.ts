import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

// Define a custom decorator to set permission metadata
export const Permissions = (...permissions: string[]) =>
  SetMetadata("permissions", permissions);

// Create a custom decorator to access permissions metadata
export const PermissionsDecorator = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.permissions;
  },
);
