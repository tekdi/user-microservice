import * as fs from "fs";
import * as path from "path";
import * as winston from "winston";
import { LoggerUtil } from "./LoggerUtil";

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
  private static readonly LOG_DIR = "logs";
  /** Name of the CSV file containing failure logs */
  private static readonly FAILURE_LOG_FILE = "shortlisting-failures.csv";
  /** Winston logger instance for shortlisting operations */
  private static shortlistingLogger: winston.Logger;

  /**
   * Gets the dedicated shortlisting logger instance
   * Creates a new logger if it doesn't exist
   */
  private static getShortlistingLogger(): winston.Logger {
    if (!ShortlistingLogger.shortlistingLogger) {
      // Ensure logs directory exists
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Create date-based filename for today's shortlisting logs
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      const shortlistingLogFile = path.join(
        ShortlistingLogger.LOG_DIR,
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

      ShortlistingLogger.shortlistingLogger = winston.createLogger({
        level: "info",
        format: winston.format.combine(
          winston.format.timestamp(),
          customFormat
        ),
        transports: [
          new winston.transports.Console(),
          new winston.transports.File({
            filename: shortlistingLogFile,
            level: "info",
          }),
        ],
      });
    }
    return ShortlistingLogger.shortlistingLogger;
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
    level = "info"
  ) {
    ShortlistingLogger.getShortlistingLogger().log({
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
    ShortlistingLogger.getShortlistingLogger().error({
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
    if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
      fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
    }

    // Create CSV file with headers if it doesn't exist
    const logFilePath = path.join(ShortlistingLogger.LOG_DIR, ShortlistingLogger.FAILURE_LOG_FILE);
    if (!fs.existsSync(logFilePath)) {
      const headers =
        "Date and Time,Cohort Id,User Id,Email Sent Status,Reason for failure in detail\n";
      fs.writeFileSync(logFilePath, headers);
    }
  }

  /**
   * Escapes a value for CSV format by wrapping in quotes and doubling internal quotes
   * @param value - The value to escape
   * @returns Properly escaped CSV value
   */
  private static escapeCSV(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  /**
   * Logs a shortlisting failure to both CSV file and main application logs
   * @param failure - The failure details to log
   */
  static logFailure(failure: ShortlistingFailureLog) {
    try {
      // Ensure logging system is initialized
      ShortlistingLogger.initialize();

      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, ShortlistingLogger.FAILURE_LOG_FILE);
      
      // Create CSV line with proper escaping for all fields
      const csvLine = [
        ShortlistingLogger.escapeCSV(failure.dateTime),
        ShortlistingLogger.escapeCSV(failure.cohortId),
        ShortlistingLogger.escapeCSV(failure.userId),
        ShortlistingLogger.escapeCSV(failure.emailSentStatus),
        ShortlistingLogger.escapeCSV(failure.failureReason)
      ].join(",") + "\n";

      // Append to CSV file
      fs.appendFileSync(logFilePath, csvLine);

      // Also log to the shortlisting logger for debugging and monitoring
      ShortlistingLogger.logShortlistingError(
        "Shortlisting evaluation failure",
        `Cohort: ${failure.cohortId}, User: ${failure.userId}, Email Status: ${failure.emailSentStatus}, Reason: ${failure.failureReason}`,
        "ShortlistingEvaluation"
      );
    } catch (error) {
      // If CSV logging fails, still log to main logger
      LoggerUtil.error(
        "Failed to write to shortlisting failure log",
        error.message,
        "ShortlistingLogger"
      );
    }
  }

  /**
   * Gets the full path to the failure log file
   * @returns Full path to the CSV log file
   */
  static getLogFilePath(): string {
    return path.join(ShortlistingLogger.LOG_DIR, ShortlistingLogger.FAILURE_LOG_FILE);
  }

  /**
   * Gets the full path to today's shortlisting log file
   * @returns Full path to today's shortlisting log file
   */
  static getTodayShortlistingLogPath(): string {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    return path.join(ShortlistingLogger.LOG_DIR, `shortlisting-${today}.log`);
  }

  /**
   * Checks if the failure log file exists
   * @returns True if the log file exists, false otherwise
   */
  static getLogFileExists(): boolean {
    return fs.existsSync(ShortlistingLogger.getLogFilePath());
  }

  /**
   * Gets the size of the failure log file in bytes
   * Useful for monitoring log file growth
   * @returns Size of the log file in bytes, 0 if file doesn't exist
   */
  static getLogFileSize(): number {
    if (ShortlistingLogger.getLogFileExists()) {
      const stats = fs.statSync(ShortlistingLogger.getLogFilePath());
      return stats.size;
    }
    return 0;
  }

  /**
   * Gets the size of today's shortlisting log file in bytes
   * @returns Size of today's shortlisting log file in bytes, 0 if file doesn't exist
   */
  static getTodayShortlistingLogSize(): number {
    const logPath = ShortlistingLogger.getTodayShortlistingLogPath();
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
    shortlistedStatus: "shortlisted" | "rejected";
    failureReason: string;
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `shortlisting-email-failed-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(emailFailureData.dateTime),
        ShortlistingLogger.escapeCSV(emailFailureData.userId),
        ShortlistingLogger.escapeCSV(emailFailureData.email),
        ShortlistingLogger.escapeCSV(emailFailureData.shortlistedStatus),
        ShortlistingLogger.escapeCSV(emailFailureData.cohortId),
        ShortlistingLogger.escapeCSV(emailFailureData.failureReason)
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId,Email Failure reason\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[EMAIL_FAILURE] Logged email failure for user ${emailFailureData.userId} in cohort ${emailFailureData.cohortId}: ${emailFailureData.failureReason}`
      );
    } catch (error) {
      console.error("Error logging email failure:", error);
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
    shortlistedStatus: "shortlisted" | "rejected";
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `shortlisting-email-success-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(emailSuccessData.dateTime),
        ShortlistingLogger.escapeCSV(emailSuccessData.userId),
        ShortlistingLogger.escapeCSV(emailSuccessData.email),
        ShortlistingLogger.escapeCSV(emailSuccessData.shortlistedStatus),
        ShortlistingLogger.escapeCSV(emailSuccessData.cohortId)
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId\n") +
          csvLine +
          "\n"
      );
    } catch (error) {
      console.error("Error logging email success:", error);
    }
  }

  /**
   * Logs rejection email failure information
   * Creates a separate log file with detailed rejection email failure information
   *
   * @param emailFailureData - Object containing rejection email failure details
   */
  static logRejectionEmailFailure(emailFailureData: {
    dateTime: string;
    userId: string;
    email: string;
    shortlistedStatus: "shortlisted" | "rejected";
    failureReason: string;
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `rejection-email-failed-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(emailFailureData.dateTime),
        ShortlistingLogger.escapeCSV(emailFailureData.userId),
        ShortlistingLogger.escapeCSV(emailFailureData.email),
        ShortlistingLogger.escapeCSV(emailFailureData.shortlistedStatus),
        ShortlistingLogger.escapeCSV(emailFailureData.cohortId),
        ShortlistingLogger.escapeCSV(emailFailureData.failureReason)
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId,Email Failure reason\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[REJECTION_EMAIL_FAILURE] Logged rejection email failure for user ${emailFailureData.userId} in cohort ${emailFailureData.cohortId}: ${emailFailureData.failureReason}`
      );
    } catch (error) {
      console.error("Error logging rejection email failure:", error);
    }
  }

  /**
   * Logs rejection email success information
   * Creates a separate log file with successful rejection email information
   *
   * @param emailSuccessData - Object containing rejection email success details
   */
  static logRejectionEmailSuccess(emailSuccessData: {
    dateTime: string;
    userId: string;
    email: string;
    shortlistedStatus: "shortlisted" | "rejected";
    cohortId: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `rejection-email-success-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(emailSuccessData.dateTime),
        ShortlistingLogger.escapeCSV(emailSuccessData.userId),
        ShortlistingLogger.escapeCSV(emailSuccessData.email),
        ShortlistingLogger.escapeCSV(emailSuccessData.shortlistedStatus),
        ShortlistingLogger.escapeCSV(emailSuccessData.cohortId)
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,email,shortlisted status(shortlisted/rejected),cohortId\n") +
          csvLine +
          "\n"
      );
    } catch (error) {
      console.error("Error logging rejection email success:", error);
    }
  }

  /**
   * Logs LMS enrollment start information
   * Creates a separate log file with LMS enrollment start details
   *
   * @param enrollmentStartData - Object containing LMS enrollment start details
   */
  static logLMSEnrollmentStart(enrollmentStartData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseCount?: number;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-enrollment-start-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(enrollmentStartData.dateTime),
        ShortlistingLogger.escapeCSV(enrollmentStartData.userId),
        ShortlistingLogger.escapeCSV(enrollmentStartData.cohortId),
        ShortlistingLogger.escapeCSV(enrollmentStartData.courseCount?.toString() || "0")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseCount\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_ENROLLMENT_START] Started LMS enrollment for user ${enrollmentStartData.userId} in cohort ${enrollmentStartData.cohortId} with ${enrollmentStartData.courseCount || 0} courses`
      );
    } catch (error) {
      console.error("Error logging LMS enrollment start:", error);
    }
  }

  /**
   * Logs LMS enrollment success information
   * Creates a separate log file with successful LMS enrollment details
   *
   * @param enrollmentSuccessData - Object containing LMS enrollment success details
   */
  static logLMSEnrollmentSuccess(enrollmentSuccessData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseId: string;
    enrollmentId?: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-enrollment-success-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(enrollmentSuccessData.dateTime),
        ShortlistingLogger.escapeCSV(enrollmentSuccessData.userId),
        ShortlistingLogger.escapeCSV(enrollmentSuccessData.cohortId),
        ShortlistingLogger.escapeCSV(enrollmentSuccessData.courseId),
        ShortlistingLogger.escapeCSV(enrollmentSuccessData.enrollmentId || "")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseId,enrollmentId\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_ENROLLMENT_SUCCESS] Successfully enrolled user ${enrollmentSuccessData.userId} to course ${enrollmentSuccessData.courseId} in cohort ${enrollmentSuccessData.cohortId}`
      );
    } catch (error) {
      console.error("Error logging LMS enrollment success:", error);
    }
  }

  /**
   * Logs LMS enrollment failure information
   * Creates a separate log file with failed LMS enrollment details
   *
   * @param enrollmentFailureData - Object containing LMS enrollment failure details
   */
  static logLMSEnrollmentFailure(enrollmentFailureData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseId: string;
    failureReason: string;
    errorCode?: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-enrollment-failed-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(enrollmentFailureData.dateTime),
        ShortlistingLogger.escapeCSV(enrollmentFailureData.userId),
        ShortlistingLogger.escapeCSV(enrollmentFailureData.cohortId),
        ShortlistingLogger.escapeCSV(enrollmentFailureData.courseId),
        ShortlistingLogger.escapeCSV(enrollmentFailureData.failureReason),
        ShortlistingLogger.escapeCSV(enrollmentFailureData.errorCode || "")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseId,failureReason,errorCode\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_ENROLLMENT_FAILURE] Failed to enroll user ${enrollmentFailureData.userId} to course ${enrollmentFailureData.courseId} in cohort ${enrollmentFailureData.cohortId}: ${enrollmentFailureData.failureReason}`
      );
    } catch (error) {
      console.error("Error logging LMS enrollment failure:", error);
    }
  }

  /**
   * Logs LMS enrollment completion summary
   * Creates a separate log file with LMS enrollment completion details
   *
   * @param enrollmentCompletionData - Object containing LMS enrollment completion details
   */
  static logLMSEnrollmentCompletion(enrollmentCompletionData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    totalCourses: number;
    successfulEnrollments: number;
    failedEnrollments: number;
    processingTime?: number;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-enrollment-completion-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.dateTime),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.userId),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.cohortId),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.totalCourses.toString()),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.successfulEnrollments.toString()),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.failedEnrollments.toString()),
        ShortlistingLogger.escapeCSV(enrollmentCompletionData.processingTime?.toString() || "0")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,totalCourses,successfulEnrollments,failedEnrollments,processingTime(ms)\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_ENROLLMENT_COMPLETION] Completed LMS enrollment for user ${enrollmentCompletionData.userId} in cohort ${enrollmentCompletionData.cohortId}. Success: ${enrollmentCompletionData.successfulEnrollments}/${enrollmentCompletionData.totalCourses}, Failed: ${enrollmentCompletionData.failedEnrollments}`
      );
    } catch (error) {
      console.error("Error logging LMS enrollment completion:", error);
    }
  }

  /**
   * Logs LMS de-enrollment start
   * Creates a separate log file with LMS de-enrollment start details
   *
   * @param deenrollmentStartData - Object containing LMS de-enrollment start details
   */
  static logLMSDeenrollmentStart(deenrollmentStartData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseCount?: number;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-deenrollment-start-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(deenrollmentStartData.dateTime),
        ShortlistingLogger.escapeCSV(deenrollmentStartData.userId),
        ShortlistingLogger.escapeCSV(deenrollmentStartData.cohortId),
        ShortlistingLogger.escapeCSV(deenrollmentStartData.courseCount?.toString() || "0")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseCount\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_DEENROLLMENT_START] Starting LMS de-enrollment for user ${deenrollmentStartData.userId} in cohort ${deenrollmentStartData.cohortId}`
      );
    } catch (error) {
      console.error("Error logging LMS de-enrollment start:", error);
    }
  }

  /**
   * Logs LMS de-enrollment success
   * Creates a separate log file with LMS de-enrollment success details
   *
   * @param deenrollmentSuccessData - Object containing LMS de-enrollment success details
   */
  static logLMSDeenrollmentSuccess(deenrollmentSuccessData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseId: string;
    deenrollmentId?: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-deenrollment-success-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(deenrollmentSuccessData.dateTime),
        ShortlistingLogger.escapeCSV(deenrollmentSuccessData.userId),
        ShortlistingLogger.escapeCSV(deenrollmentSuccessData.cohortId),
        ShortlistingLogger.escapeCSV(deenrollmentSuccessData.courseId),
        ShortlistingLogger.escapeCSV(deenrollmentSuccessData.deenrollmentId || "")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseId,deenrollmentId\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_DEENROLLMENT_SUCCESS] Successfully de-enrolled user ${deenrollmentSuccessData.userId} from course ${deenrollmentSuccessData.courseId} in cohort ${deenrollmentSuccessData.cohortId}`
      );
    } catch (error) {
      console.error("Error logging LMS de-enrollment success:", error);
    }
  }

  /**
   * Logs LMS de-enrollment failure
   * Creates a separate log file with LMS de-enrollment failure details
   *
   * @param deenrollmentFailureData - Object containing LMS de-enrollment failure details
   */
  static logLMSDeenrollmentFailure(deenrollmentFailureData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    courseId: string;
    failureReason: string;
    errorCode?: string;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-deenrollment-failed-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.dateTime),
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.userId),
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.cohortId),
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.courseId),
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.failureReason),
        ShortlistingLogger.escapeCSV(deenrollmentFailureData.errorCode || "")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,courseId,failureReason,errorCode\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_DEENROLLMENT_FAILURE] Failed to de-enroll user ${deenrollmentFailureData.userId} from course ${deenrollmentFailureData.courseId} in cohort ${deenrollmentFailureData.cohortId}: ${deenrollmentFailureData.failureReason}`
      );
    } catch (error) {
      console.error("Error logging LMS de-enrollment failure:", error);
    }
  }

  /**
   * Logs LMS de-enrollment completion summary
   * Creates a separate log file with LMS de-enrollment completion details
   *
   * @param deenrollmentCompletionData - Object containing LMS de-enrollment completion details
   */
  static logLMSDeenrollmentCompletion(deenrollmentCompletionData: {
    dateTime: string;
    userId: string;
    cohortId: string;
    totalCourses: number;
    successfulDeenrollments: number;
    failedDeenrollments: number;
    processingTime?: number;
  }) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const logFileName = `lms-deenrollment-completion-${today}.csv`;
      const logFilePath = path.join(ShortlistingLogger.LOG_DIR, logFileName);

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(ShortlistingLogger.LOG_DIR)) {
        fs.mkdirSync(ShortlistingLogger.LOG_DIR, { recursive: true });
      }

      // Check if file exists to determine if we need to write headers
      const fileExists = fs.existsSync(logFilePath);

      // Prepare CSV line with proper comma delimiters
      const csvLine = [
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.dateTime),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.userId),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.cohortId),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.totalCourses.toString()),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.successfulDeenrollments.toString()),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.failedDeenrollments.toString()),
        ShortlistingLogger.escapeCSV(deenrollmentCompletionData.processingTime?.toString() || "0")
      ].join(",");

      // Write to file (append mode)
      fs.appendFileSync(
        logFilePath,
        (fileExists
          ? ""
          : "Date and time,userId,cohortId,totalCourses,successfulDeenrollments,failedDeenrollments,processingTime(ms)\n") +
          csvLine +
          "\n"
      );

      console.log(
        `[LMS_DEENROLLMENT_COMPLETION] Completed LMS de-enrollment for user ${deenrollmentCompletionData.userId} in cohort ${deenrollmentCompletionData.cohortId}. Success: ${deenrollmentCompletionData.successfulDeenrollments}/${deenrollmentCompletionData.totalCourses}, Failed: ${deenrollmentCompletionData.failedDeenrollments}`
      );
    } catch (error) {
      console.error("Error logging LMS de-enrollment completion:", error);
    }
  }
}
