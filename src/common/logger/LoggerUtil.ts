import * as winston from 'winston';

export class LoggerUtil {
    private static logger: winston.Logger;

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
                    new winston.transports.File({ filename: 'error.log', level: 'error' }),
                    new winston.transports.File({ filename: 'combined.log' }),
                ],
            });
        }
        return this.logger;
    }
    static log(
        message: string,
        context?: string,
        user?: string,
        level: string = 'info',
    ) {
        this.getLogger().log({
            level: level,
            message: message,
            context: context,
            user: user,
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
            message: message,
            error: error,
            context: context,
            user: user,
            timestamp: new Date().toISOString(),
        });
    }

    static warn(message: string, context?: string) {
        this.getLogger().warn({
            message: message,
            context: context,
            timestamp: new Date().toISOString(),
        });
    }

    static debug(message: string, context?: string) {
        this.getLogger().debug({
            message: message,
            context: context,
            timestamp: new Date().toISOString(),
        });
    }
}