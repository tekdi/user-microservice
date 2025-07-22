import * as winston from "winston";

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
        level: "info",
        format: winston.format.combine(
          winston.format.timestamp(),
          customFormat,
        ),
        transports: [new winston.transports.Console()],
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
    level: string = "info",
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
