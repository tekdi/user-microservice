import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import jwt_decode from "jwt-decode";

export const GetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Invalid or missing token");
    }

    try {
      const token = authHeader.split(" ")[1]; // Extract JWT token
      const decoded: any = jwt_decode(token); // Decode token
      return decoded?.sub; // Assuming `sub` is where userId is stored
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  },
);
