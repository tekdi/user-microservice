import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RbacJwtStrategy extends PassportStrategy(Strategy, "jwt-rbac") {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromHeader("rbac_token"),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("RBAC_JWT_SECRET"),
      passReqToCallback: true,
    });
  }

  async validate(request: any, payload: any) {
    const requiredPermissions = request.user.requiredPermissions;

    const userPermissions = payload.userData.privileges;
    const roles = payload.userData.roles;

    if (roles.includes("admin")) {
      return payload;
    }

    if (
      !(
        payload.iss === this.configService.get<string>("ISSUER") &&
        payload.aud === this.configService.get<string>("AUDIENCE") &&
        userPermissions.length > 0
      )
    ) {
      throw new UnauthorizedException();
    }

    const isAuthorized = requiredPermissions.every((permission: string) =>
      userPermissions.includes(permission),
    );

    if (isAuthorized) {
      return payload;
    }

    throw new UnauthorizedException();
  }
}
