import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt-keycloak") {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("KEYCLOAK_REALM_RSA_PUBLIC_KEY"),
    });
  }

  async validate(payload: any) {
    /**
     * This can be obtained via req.user in the Controllers
     * This is where we validate that the user is valid and delimit the payload returned to req.user
     */
    const roles = payload.realm_access?.roles || [];
    return {
      userId: payload.sub,
      name: payload.name || payload.preferred_username || "Unknown",
      username: payload.preferred_username,
      roles: roles,
      // For convenience, if there's a primary role we want to use for audit
      role: roles.length > 0 ? roles[0] : "Unknown",
    };
  }
}
