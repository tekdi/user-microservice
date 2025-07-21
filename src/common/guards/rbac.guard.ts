import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

@Injectable()
export class RbacAuthGuard extends AuthGuard("jwt-rbac") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Required permissions come from permission decorator for each API end point
    const requiredPermissions = this.reflector.get<string[]>(
      "permissions",
      context.getHandler(),
    );

    const payload = super.getRequest(context).user;

    if (!requiredPermissions) {
      return true; // No permissions required, allow access
    }
    payload.requiredPermissions = requiredPermissions;
    // const request = context.switchToHttp().getRequest();
    // request.requiredPermissions = requiredPermissions;
    return super.canActivate(context);
  }
}
