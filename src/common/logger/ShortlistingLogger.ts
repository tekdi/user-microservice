import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { LoggerUtil } from './LoggerUtil';

/**
 * Interface defining the structure of a shortlisting failure log entry
 * Used for tracking and logging failed shortlisting evaluations
 */
export interface ShortlistingFailureLog {
  /** ISO timestamp of when the failure occurred */
  dateTime: string;
  /** UUID of the cohort where the failure occurred */
  cohortId: string;
  /** UUID of the user whose evaluation failed */
  userId: string;
  /** Status of email notification attempt ('SUCCESS', 'FAILED', 'NOT_ATTEMPTED') */
  emailSentStatus: string;
  /** Detailed reason for the failure */
  failureReason: string;
}

/**
 * Specialized logger for cohort member shortlisting evaluation failures
 * Creates separate log files for shortlisting operations and failure tracking
 */
export class ShortlistingLogger {
  /** Directory where log files are stored */
  private static readonly LOG_DIR = 'logs';
  /** Name of the CSV file containing failure logs */
  private static readonly FAILURE_LOG_FILE = 'shortlisting-failures.csv';
  /** Winston logger instance for shortlisting operations */
  private static shortlistingLogger: winston.Logger;

  /**
   * Gets the dedicated shortlisting logger instance
   * Creates a new logger if it doesn't exist
   */
  private static getShortlistingLogger(): winston.Logger {
    if (!this.shortlistingLogger) {
      // Ensure logs directory exists
      if (!fs.existsSync(this.LOG_DIR)) {
        fs.mkdirSync(this.LOG_DIR, { recursive: true });
      }

      // Create date-based filename for today's shortlisting logs
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const shortlistingLogFile = path.join(
        this.LOG_DIR,
        `shortlisting-${today}.log`
      );

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
        }
      );

      this.shortlistingLogger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          customFormat
        ),
        transports: [
          new winston.transports.Console(),
          new winston.transports.File({
            filename: shortlistingLogFile,
            level: 'info',
          }),
        ],
      });
    }
    return this.shortlistingLogger;
  }

  /**
   * Logs shortlisting evaluation information to the dedicated shortlisting log file
   * @param message - The log message
   * @param context - Optional context for the log
   * @param user - Optional user identifier
   * @param level - Log level (default: 'info')
   */
  static logShortlisting(
    message: string,
    context?: string,
    user?: string,
    level: string = 'info'
  ) {
    this.getShortlistingLogger().log({
      level: level,
      message: message,
      context: context,
      user: user,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Logs shortlisting evaluation errors to the dedicated shortlisting log file
   * @param message - The error message
   * @param error - Optional error details
   * @param context - Optional context for the log
   * @param user - Optional user identifier
   */
  static logShortlistingError(
    message: string,
    error?: string,
    context?: string,
    user?: string
  ) {
    this.getShortlistingLogger().error({
      message: message,
      error: error,
      context: context,
      user: user,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Initializes the logging system by creating necessary directories and files
   * Creates the logs directory if it doesn't exist and initializes CSV file with headers
   */
  static initialize() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.LOG_DIR)) {
      fs.mkdirSync(this.LOG_DIR, { recursive: true });
    }

    // Create CSV file with headers if it doesn't exist
    const logFilePath = path.join(this.LOG_DIR, this.FAILURE_LOG_FILE);
    if (!fs.existsSync(logFilePath)) {
      const headers =
        'Date and Time,Cohort Id,User Id,Email Sent Status,Reason for failure in detail\n';
      fs.writeFileSync(logFilePath, headers);
    }
  }

  /**
   * Logs a shortlisting failure to both CSV file and main application logs
   * @param failure - The failure details to log
   */
  static logFailure(failure: ShortlistingFailureLog) {
    try {
      // Ensure logging system is initialized
      this.initialize();

      const logFilePath = path.join(this.LOG_DIR, this.FAILURE_LOG_FILE);
      // Create CSV line with proper escaping for special characters
      const csvLine = `"${failure.dateTime}","${failure.cohortId}","${failure.userId}","${failure.emailSentStatus}","${failure.failureReason}"\n`;

      // Append to CSV file
      fs.appendFileSync(logFilePath, csvLine);

      // Also log to the shortlisting logger for debugging and monitoring
      this.logShortlistingError(
        'Shortlisting evaluation failure',
        `Cohort: ${failure.cohortId}, User: ${failure.userId}, Email Status: ${failure.emailSentStatus}, Reason: ${failure.failureReason}`,
        'ShortlistingEvaluation'
      );
    } catch (error) {
      // If CSV logging fails, still log to main logger
      LoggerUtil.error(
        'Failed to write to shortlisting failure log',
        error.message,
        'ShortlistingLogger'
      );
    }
  }

  /**
   * Gets the full path to the failure log file
   * @returns Full path to the CSV log file
   */
  static getLogFilePath(): string {
    return path.join(this.LOG_DIR, this.FAILURE_LOG_FILE);
  }

  /**
   * Gets the full path to today's shortlisting log file
   * @returns Full path to today's shortlisting log file
   */
  static getTodayShortlistingLogPath(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return path.join(this.LOG_DIR, `shortlisting-${today}.log`);
  }

  /**
   * Checks if the failure log file exists
   * @returns True if the log file exists, false otherwise
   */
  static getLogFileExists(): boolean {
    return fs.existsSync(this.getLogFilePath());
  }

  /**
   * Gets the size of the failure log file in bytes
   * Useful for monitoring log file growth
   * @returns Size of the log file in bytes, 0 if file doesn't exist
   */
  static getLogFileSize(): number {
    if (this.getLogFileExists()) {
      const stats = fs.statSync(this.getLogFilePath());
      return stats.size;
    }
    return 0;
  }

  /**
   * Gets the size of today's shortlisting log file in bytes
   * @returns Size of today's shortlisting log file in bytes, 0 if file doesn't exist
   */
  static getTodayShortlistingLogSize(): number {
    const logPath = this.getTodayShortlistingLogPath();
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      return stats.size;
    }
    return 0;
  }

  /**
   * Logs email failure information for shortlisting notifications
   * Creates a separate log file with detailed email failure information
   *
   * @param emailFailureData - Object containing email failure details
   */
  static logEmailFailure(emailFailureData: {
    dateTime: string;
    userId: string;
    email: string;
    shortlistedStatus: 'shortlisted' | 'rejected';
    failureReason: string;
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFileName = `shortlisting-email-failed-${today}.csv`;
      const logFilePath = path.join(this.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.LOG_DIR)) {
        fs.mkdirSync(this.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        `"${emailFailureData.dateTime}"`,
        `"${emailFailureData.userId}"`,
        `"${emailFailureData.email}"`,
        `"${emailFailureData.shortlistedStatus}"`,
        `"${emailFailureData.cohortId}"`,
        `"${emailFailureData.failureReason.replace(/"/g, '""')}"`, // Escape quotes in reason
      ].join(',');

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ''
          : 'Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId,Email Failure reason\n') +
          csvLine +
          '\n'
      );

      console.log(
        `📧 [EMAIL_FAILURE] Logged email failure for user ${emailFailureData.userId} in cohort ${emailFailureData.cohortId}: ${emailFailureData.failureReason}`
      );
    } catch (error) {
      console.error('Error logging email failure:', error);
    }
  }

  /**
   * Logs email success information for shortlisting notifications
   * Creates a separate log file with successful email information
   *
   * @param emailSuccessData - Object containing email success details
   */
  static logEmailSuccess(emailSuccessData: {
    dateTime: string;
    userId: string;
    email: string;
    shortlistedStatus: 'shortlisted' | 'rejected';
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFileName = `shortlisting-email-success-${today}.csv`;
      const logFilePath = path.join(this.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.LOG_DIR)) {
        fs.mkdirSync(this.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        `"${emailSuccessData.dateTime}"`,
        `"${emailSuccessData.userId}"`,
        `"${emailSuccessData.email}"`,
        `"${emailSuccessData.shortlistedStatus}"`,
        `"${emailSuccessData.cohortId}"`,
      ].join(',');

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ''
          : 'Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId\n') +
          csvLine +
          '\n'
      );
    } catch (error) {
      console.error('Error logging email success:', error);
    }
  }
}
