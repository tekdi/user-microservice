import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtUtil {
    constructor(
        private readonly jwtService: JwtService) {
    }

    async generateTokenForForgotPassword(payload: any, passwordexpiresIn: any, jwtSecret: any) {
        const plainObject = JSON.parse(JSON.stringify(payload));
        // Generating token
        const token = await this.jwtService.signAsync(plainObject, {
            secret: jwtSecret,
            expiresIn: passwordexpiresIn,
            // noTimestamp: true,
        });
        return token;
    }

    async validateToken(token: string, jwtSecret: any) {
        const decoded = await this.jwtService.verifyAsync(token, {
            secret: jwtSecret,
        });
        return decoded;
    }

}
