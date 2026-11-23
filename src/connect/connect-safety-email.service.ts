import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { NotificationRequest } from "@utils/notification.axios";
import { SafetyReport } from "./entities/safety-report.entity";
import { CONNECT_SAFETY_EMAIL } from "./constants/connect.constants";

interface EmailUser {
  userId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  linkedinUrl: string | null;
}

/**
 * Safety concern email (A7) to the member who raised it: how to block the
 * reported member on LinkedIn. Sent through the notification service
 * (template CONNECT_SAFETY_EMAIL.REPORTER_KEY, context USER) every time the
 * member asks for it, also when the report already exists.
 *
 * The template owns the wording, fixed links (LinkedIn help) and the support
 * address. This service only sends what changes per report: the names and
 * the reported member's LinkedIn URL (see replacements()). The template can
 * use any of them, or none; unused ones are ignored by the notification
 * service.
 *
 * Errors are logged and never thrown, so a report is never lost because of
 * an email problem; the caller gets false and the member can try again.
 */
@Injectable()
export class ConnectSafetyEmailService {
  private readonly logger = new Logger(ConnectSafetyEmailService.name);

  constructor(
    private readonly notificationRequest: NotificationRequest,
    private readonly dataSource: DataSource
  ) {}

  /** true when the notification service accepted the reporter email */
  async sendToReporter(report: SafetyReport): Promise<boolean> {
    if (!report.reportedUserId) {
      // general concern: there is no member to block
      return false;
    }
    try {
      const users = await this.loadUsers([
        report.reporterUserId,
        report.reportedUserId,
      ]);
      const reporter = users.get(report.reporterUserId);
      const reported = users.get(report.reportedUserId);
      if (!reporter?.email) {
        this.logger.warn(
          `Safety concern ${report.id}: reporter has no email, steps not sent`
        );
        return false;
      }
      return await this.send(
        report.id,
        [reporter.email],
        this.replacements(reporter, reported)
      );
    } catch (error) {
      this.logger.error(
        `Safety concern ${report.id}: email failed: ${error?.message}`
      );
      return false;
    }
  }

  /**
   * Placeholders for the template body and subject, e.g. "Hi {reporterName}"
   * or <a href="{reportedLinkedinUrl}">. Missing values are sent as "" so a
   * template using them still renders.
   */
  private replacements(
    reporter: EmailUser,
    reported: EmailUser | undefined
  ): Record<string, string> {
    return {
      "{reporterName}": reporter.name || "there",
      "{reporterFirstName}": reporter.firstName || reporter.name || "there",
      "{reporterLastName}": reporter.lastName,
      "{reportedName}": reported?.name || "this member",
      "{reportedFirstName}":
        reported?.firstName || reported?.name || "this member",
      "{reportedLastName}": reported?.lastName ?? "",
      "{reportedLinkedinUrl}": reported?.linkedinUrl ?? "",
    };
  }

  /** true when the notification service accepted the email */
  private async send(
    reportId: string,
    recipients: string[],
    replacements: Record<string, string>
  ): Promise<boolean> {
    const key = CONNECT_SAFETY_EMAIL.REPORTER_KEY;
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
      rows.map((r) => {
        const firstName = (r.firstName ?? "").trim();
        const lastName = (r.lastName ?? "").trim();
        return [
          r.userId,
          {
            userId: r.userId,
            firstName,
            lastName,
            name: [firstName, lastName].filter(Boolean).join(" "),
            email: r.email || null,
            linkedinUrl: r.linkedinUrl || null,
          },
        ];
      })
    );
  }
}
