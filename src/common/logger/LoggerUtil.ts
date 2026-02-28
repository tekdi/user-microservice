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
                        // Log rotation configuration for performance and disk space management
                        // When log file reaches 5MB, it will be rotated (renamed) and a new file created
                        maxsize: 5242880, // 5MB - maximum size before rotation
                        maxFiles: 5, // Keep maximum 5 rotated log files (error.log, error.log.1, error.log.2, etc.)
                        tailable: true, // Oldest logs are deleted when maxFiles is reached
                    }),
                    new winston.transports.File({ 
                        filename: 'combined.log',
                        // Log rotation configuration for performance and disk space management
                        // When log file reaches 5MB, it will be rotated (renamed) and a new file created
                        maxsize: 5242880, // 5MB - maximum size before rotation
                        maxFiles: 5, // Keep maximum 5 rotated log files (combined.log, combined.log.1, combined.log.2, etc.)
                        tailable: true, // Oldest logs are deleted when maxFiles is reached
                    }),
                ],
                // Prevent Winston from exiting the process when logging errors occur
                // This ensures logging failures don't crash the application
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