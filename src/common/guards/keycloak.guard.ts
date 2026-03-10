import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-keycloak") implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const serviceTokenHeader = request.headers['x-service-token'];
    
    // Check if internal service token bypasses auth
    if (
      serviceTokenHeader && 
      process.env.SERVICE_AUTH_TOKEN && 
      serviceTokenHeader === process.env.SERVICE_AUTH_TOKEN
    ) {
      return true;
    }

    // Otherwise, fallback to the standard JWT Keycloak auth
    return (super.canActivate(context) as Promise<boolean>);
  }
}
