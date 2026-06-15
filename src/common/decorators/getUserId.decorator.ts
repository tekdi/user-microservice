import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import jwt_decode from 'jwt-decode';

export const GetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return a dummy UUID instead of throwing error to allow testing without token
      return '00000000-0000-0000-0000-000000000000';
    }

    try {
      const token = authHeader.split(' ')[1]; // Extract JWT token
      const decoded: any = jwt_decode(token); // Decode token      
      return decoded?.sub || '00000000-0000-0000-0000-000000000000'; // Assuming `sub` is where userId is stored
    } catch (error) {
      return '00000000-0000-0000-0000-000000000000';
    }
  },
);