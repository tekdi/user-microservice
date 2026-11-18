import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { NotificationRequest } from "@utils/notification.axios";
import { SafetyReport } from "./entities/safety-report.entity";
import { CONNECT_SAFETY_EMAIL } from "./constants/connect.constants";

interface EmailUser {
  userId: string;
  name: string;
  email: string | null;
  linkedinUrl: string | null;
}

const EMPTY = "-";

/**
 * Safety concern emails (A7), through the notification service:
 *  - reporter: how to block the member on LinkedIn
 *  - admins (CONNECT_SAFETY_ADMIN_EMAILS): a new report to review
 * Errors are logged and never thrown, so a report is never lost because of
 * an email problem.
 */
@Injectable()
export class ConnectSafetyEmailService {
  private readonly logger = new Logger(ConnectSafetyEmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationRequest: NotificationRequest,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Sends the reporter email (member reports only) and, for a new report,
   * the admin email. Returns true when the reporter email was accepted.
   */
  async sendForReport(report: SafetyReport, isNew: boolean): Promise<boolean> {
    try {
      const users = await this.loadUsers(
        [report.reporterUserId, report.reportedUserId].filter(Boolean)
      );
      const reporter = users.get(report.reporterUserId);
      const reported = report.reportedUserId
        ? users.get(report.reportedUserId)
        : undefined;

      const [reporterSent] = await Promise.all([
        reported ? this.sendReporterSteps(report, reporter, reported) : false,
        isNew ? this.sendAdminAlert(report, reporter, reported) : undefined,
      ]);
      return reporterSent;
    } catch (error) {
      this.logger.error(
        `Safety concern emails failed for report ${report.id}: ${error?.message}`
      );
      return false;
    }
  }

  private async sendReporterSteps(
    report: SafetyReport,
    reporter: EmailUser | undefined,
    reported: EmailUser
  ): Promise<boolean> {
    if (!reporter?.email) {
      this.logger.warn(
        `Safety concern ${report.id}: reporter has no email, steps not sent`
      );
      return false;
    }
    return this.send(
      report.id,
      CONNECT_SAFETY_EMAIL.REPORTER_KEY,
      [reporter.email],
      {
        "{reporterName}": reporter.name || "there",
        "{reportedName}": reported.name || "this member",
        "{reportedLinkedinUrl}": reported.linkedinUrl || EMPTY,
        "{linkedinBlockHelpUrl}": CONNECT_SAFETY_EMAIL.LINKEDIN_BLOCK_HELP_URL,
        "{supportEmail}": this.supportEmail(),
      }
    );
  }

  private async sendAdminAlert(
    report: SafetyReport,
    reporter: EmailUser | undefined,
    reported: EmailUser | undefined
  ): Promise<void> {
    const recipients = this.adminEmails();
    if (!recipients.length) {
      this.logger.warn(
        `Safety concern ${report.id}: CONNECT_SAFETY_ADMIN_EMAILS is empty, admin email not sent`
      );
      return;
    }
    await this.send(report.id, CONNECT_SAFETY_EMAIL.ADMIN_KEY, recipients, {
      "{reportId}": report.id,
      "{reportType}": report.reportedUserId
        ? "Member report"
        : "General concern",
      "{reporterName}": reporter?.name || EMPTY,
      "{reporterEmail}": reporter?.email || EMPTY,
      "{reportedName}": reported?.name || EMPTY,
      "{reportedEmail}": reported?.email || EMPTY,
      "{reportedLinkedinUrl}": reported?.linkedinUrl || EMPTY,
      "{subject}": report.subject || EMPTY,
      "{reason}": report.reason,
      "{details}": report.details || EMPTY,
      "{createdAt}": new Date(report.createdAt ?? Date.now()).toISOString(),
    });
  }

  /** true when the notification service accepted the email */
  private async send(
    reportId: string,
    key: string,
    recipients: string[],
    replacements: Record<string, string>
  ): Promise<boolean> {
    try {
      const result = await this.notificationRequest.sendNotification({
        isQueue: false,
        context: CONNECT_SAFETY_EMAIL.CONTEXT,
        key,
        replacements,
        email: { receipients: recipients },
      });
      const errors = result?.result?.email?.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        this.logger.error(
          `Safety concern ${reportId}: ${key} reported errors: ${JSON.stringify(
            errors
          )}`
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Safety concern ${reportId}: ${key} failed: ${error?.message}`
      );
      return false;
    }
  }

  private async loadUsers(userIds: string[]): Promise<Map<string, EmailUser>> {
    const rows = await this.dataSource.query(
      `SELECT u."userId", u."firstName", u."lastName", u."email", cp."linkedinUrl"
         FROM "Users" u
         LEFT JOIN connect_profiles cp ON cp."userId" = u."userId"
        WHERE u."userId" = ANY($1::uuid[])`,
      [userIds]
    );
    return new Map(
      rows.map((r) => [
        r.userId,
        {
          userId: r.userId,
          name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
          email: r.email || null,
          linkedinUrl: r.linkedinUrl || null,
        },
      ])
    );
  }

  private adminEmails(): string[] {
    return String(this.configService.get("CONNECT_SAFETY_ADMIN_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }

  private supportEmail(): string {
    return (
      this.configService.get<string>("CONNECT_SUPPORT_EMAIL")?.trim() ||
      CONNECT_SAFETY_EMAIL.DEFAULT_SUPPORT_EMAIL
    );
  }
}
