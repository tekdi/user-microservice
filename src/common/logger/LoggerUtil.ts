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
                    new winston.transports.Console({
                        // Console logging is fast and non-blocking
                        handleExceptions: false,
                        handleRejections: false,
                    }),
                    new winston.transports.File({ 
                        filename: 'error.log', 
                        level: 'error',
                        // Optimize file writes for performance
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        tailable: true,
                    }),
                    new winston.transports.File({ 
                        filename: 'combined.log',
                        // Optimize file writes for performance
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
                        tailable: true,
                    }),
                ],
                // Exit on error to prevent logging failures from crashing the app
                exitOnError: false,
            });
        }
        return this.logger;
    }

    /**
     * Non-blocking log method - uses process.nextTick to offload logging
     * This ensures API responses are not delayed by logging operations
     */
    static log(
        message: string,
        context?: string,
        user?: string,
        level: string = 'info',
    ) {
        // Use process.nextTick to make logging non-blocking
        // This ensures the API response is sent before logging completes
        process.nextTick(() => {
            try {
                this.getLogger().log({
                    level: level,
                    message: message,
                    context: context,
                    user: user,
                    timestamp: new Date().toISOString(),
                });
            } catch (err) {
                // Silently fail - don't let logging errors affect API responses
                // Only log to console as last resort
                console.error('Logger error:', err);
            }
        });
    }

    /**
     * Non-blocking error log method
     */
    static error(
        message: string,
        error?: string,
        context?: string,
        user?: string,
    ) {
        // Use process.nextTick to make logging non-blocking
        process.nextTick(() => {
            try {
                this.getLogger().error({
                    message: message,
                    error: error,
                    context: context,
                    user: user,
                    timestamp: new Date().toISOString(),
                });
            } catch (err) {
                // Silently fail - don't let logging errors affect API responses
                console.error('Logger error:', err);
            }
        });
    }

    /**
     * Non-blocking warn log method
     */
    static warn(message: string, context?: string) {
        process.nextTick(() => {
            try {
                this.getLogger().warn({
                    message: message,
                    context: context,
                    timestamp: new Date().toISOString(),
                });
            } catch (err) {
                console.error('Logger error:', err);
            }
        });
    }

    /**
     * Non-blocking debug log method
     */
    static debug(message: string, context?: string) {
        process.nextTick(() => {
            try {
                this.getLogger().debug({
                    message: message,
                    context: context,
                    timestamp: new Date().toISOString(),
                });
            } catch (err) {
                console.error('Logger error:', err);
            }
        });
    }
}