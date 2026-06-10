import * as winston from 'winston';

export class LoggerUtil {
    private static logger: winston.Logger;

    private static sanitizeLogValue(value?: string): string | undefined {
        if (typeof value !== 'string') {
            return value;
        }

        return value
            .replace(/(password|newPassword|oldPassword)\s*[:=]\s*[^,\s]+/gi, '$1=[REDACTED]')
            .replace(/(token|access_token|refresh_token|id_token)\s*[:=]\s*[^,\s]+/gi, '$1=[REDACTED]')
            .replace(/(secret|client_secret|api[_-]?key)\s*[:=]\s*[^,\s]+/gi, '$1=[REDACTED]')
            .replace(/(otp|code)\s*[:=]\s*[^,\s]+/gi, '$1=[REDACTED]')
            .replace(/(authorization|cookie)\s*[:=]\s*[^,\s]+/gi, '$1=[REDACTED]')
            .replace(/\bUSER_RESET_PASSWORD\b/gi, '[REDACTED]');
    }

    static getLogger() {
        if (!this.logger) {
            const customFormat = winston.format.printf(
                ({ timestamp, level, message, context, user, error }) => {
                    return JSON.stringify({
                        timestamp: timestamp,
                        context: context,
                        user: user,
                        level: level,
                        message: message,
                        error: error,
                    });
                },
            );

            this.logger = winston.createLogger({
                level: 'info',
                format: winston.format.combine(winston.format.timestamp(), customFormat),
                transports: [
                    new winston.transports.Console(),
                ],
            });
        }
        return this.logger;
    }

    // Method to reset logger (useful for testing or when files are deleted)
    static resetLogger() {
        this.logger = null;
    }

    static log(
        message: string,
        context?: string,
        user?: string,
        level: string = 'info',
    ) {
        this.getLogger().log({
            level: level,
            message: this.sanitizeLogValue(message),
            context: this.sanitizeLogValue(context),
            user: this.sanitizeLogValue(user),
            timestamp: new Date().toISOString(),
        });
    }

    static error(
        message: string,
        error?: string,
        context?: string,
        user?: string,
    ) {
        this.getLogger().error({
            message: this.sanitizeLogValue(message),
            error: this.sanitizeLogValue(error),
            context: this.sanitizeLogValue(context),
            user: this.sanitizeLogValue(user),
            timestamp: new Date().toISOString(),
        });
    }

    static warn(message: string, context?: string) {
        this.getLogger().warn({
            message: this.sanitizeLogValue(message),
            context: context ? '[REDACTED_CONTEXT]' : undefined,
            timestamp: new Date().toISOString(),
        });
    }

    static debug(message: string, context?: string) {
        this.getLogger().debug({
            message: this.sanitizeLogValue(message),
            context: this.sanitizeLogValue(context),
            timestamp: new Date().toISOString(),
        });
    }
}