import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Response } from "express";
import APIResponse from "src/common/responses/response";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { CacheService } from "src/cache/cache.service";
import { SafetyReport } from "./entities/safety-report.entity";
import {
  CONNECT_CACHE,
  CONNECT_ERRORS,
  CONNECT_LIMITS,
  ConnectReportStatus,
} from "./constants/connect.constants";
import { ConnectService } from "./connect.service";
import { CreateConnectReportDto } from "./dto/create-connect-report.dto";
import {
  SafetyReportListDto,
  UpdateSafetyReportDto,
} from "./dto/safety-report-admin.dto";

/**
 * safety_reports. Members create reports (always status OPEN); only the
 * admin APIs (ConnectAdminGuard) list them and change the status.
 */
@Injectable()
export class SafetyReportService {
  constructor(
    @InjectRepository(SafetyReport)
    private readonly reportRepository: Repository<SafetyReport>,
    private readonly connectService: ConnectService,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource
  ) {}

  // ---------------------------------------------------------------------
  // A7. POST /connect/reports
  //   reportedUserId set  → "Report this profile" (caller must be a member)
  //   reportedUserId null → "Report a concern" (any user of the tenant, subject required)
  // ---------------------------------------------------------------------
  async createReport(
    reporterUserId: string,
    tenantId: string,
    dto: CreateConnectReportDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_REPORT_CREATE;
    const cs = this.connectService;
    try {
      const reportedUserId = dto.reportedUserId ?? null;

      if (reportedUserId) {
        const denied = await cs.checkActiveMember(reporterUserId);
        if (denied) {
          return cs.fail(response, apiId, denied.error, denied.status);
        }
        if (reportedUserId === reporterUserId) {
          return cs.fail(
            response,
            apiId,
            CONNECT_ERRORS.SELF_ACTION,
            HttpStatus.BAD_REQUEST
          );
        }
        if ((await cs.getMemberStatus(reportedUserId)) === null) {
          return cs.fail(
            response,
            apiId,
            CONNECT_ERRORS.PROFILE_NOT_FOUND,
            HttpStatus.NOT_FOUND
          );
        }

        // one open report per reporter/member pair
        const existing = await this.findOpenReport(
          reporterUserId,
          reportedUserId
        );
        if (existing) {
          return this.sendExisting(response, existing);
        }
      } else if (!dto.subject) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.INVALID_REPORT,
          HttpStatus.BAD_REQUEST
        );
      }

      // daily rate limit (best effort: skipped when Redis is off)
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const dayKey = CONNECT_CACHE.REPORT_DAY_KEY(reporterUserId, day);
      const sentToday = (await this.cacheService.get<number>(dayKey)) ?? 0;
      if (sentToday >= CONNECT_LIMITS.REPORTS_PER_DAY) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.REPORT_LIMIT,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      let report: SafetyReport;
      try {
        report = await this.reportRepository.save(
          this.reportRepository.create({
            reporterUserId,
            reportedUserId,
            subject: reportedUserId ? null : dto.subject,
            reason: dto.reason,
            details: dto.details,
            // never taken from the request
            status: ConnectReportStatus.OPEN,
          })
        );
      } catch (error) {
        // two submits at the same time hit ux_safety_reports_open_pair
        if (error?.code === "23505" && reportedUserId) {
          const existing = await this.findOpenReport(
            reporterUserId,
            reportedUserId
          );
          if (existing) return this.sendExisting(response, existing);
        }
        throw error;
      }

      await cs.safeCacheSet(
        dayKey,
        sentToday + 1,
        CONNECT_CACHE.REPORT_DAY_TTL
      );

      return APIResponse.success(
        response,
        apiId,
        {
          reportId: report.id,
          status: report.status,
          createdAt: report.createdAt,
        },
        HttpStatus.CREATED,
        API_RESPONSES.CONNECT_REPORT_CREATED
      );
    } catch (error) {
      return cs.internalError(
        response,
        apiId,
        "createReport",
        error,
        reporterUserId
      );
    }
  }

  // ---------------------------------------------------------------------
  // B7. POST /connect/admin/safety-reports/list  (admin only)
  // ---------------------------------------------------------------------
  async listReports(dto: SafetyReportListDto, response: Response) {
    const apiId = APIID.CONNECT_ADMIN_SAFETY_REPORT_LIST;
    try {
      const page = dto.page ?? 1;
      const limit = dto.limit ?? CONNECT_LIMITS.ADMIN_LIST_DEFAULT_LIMIT;
      const params: any[] = [];
      const where: string[] = [];
      for (const [column, value] of [
        ["status", dto.status],
        ["reason", dto.reason],
        ["reportedUserId", dto.reportedUserId],
        ["reporterUserId", dto.reporterUserId],
      ] as const) {
        if (value) {
          params.push(value);
          where.push(`sr."${column}" = $${params.length}`);
        }
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [{ count }] = await this.dataSource.query(
        `SELECT count(*)::int AS count FROM safety_reports sr ${whereSql}`,
        params
      );
      params.push(limit, (page - 1) * limit);
      const rows = await this.dataSource.query(
        `SELECT sr.*,
                NULLIF(TRIM(CONCAT_WS(' ', rp."firstName", rp."lastName")), '') AS "reporterName",
                rp."email" AS "reporterEmail",
                NULLIF(TRIM(CONCAT_WS(' ', rd."firstName", rd."lastName")), '') AS "reportedName",
                rd."email" AS "reportedEmail",
                (SELECT count(*)::int FROM safety_reports o
                  WHERE o."reportedUserId" = sr."reportedUserId") AS "reportsAgainstMember"
           FROM safety_reports sr
           LEFT JOIN "Users" rp ON rp."userId" = sr."reporterUserId"
           LEFT JOIN "Users" rd ON rd."userId" = sr."reportedUserId"
           ${whereSql}
          ORDER BY sr."createdAt" DESC, sr."id"
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return APIResponse.success(
        response,
        apiId,
        {
          items: rows,
          page,
          limit,
          totalCount: count,
          totalPages: Math.ceil(count / limit),
        },
        HttpStatus.OK,
        API_RESPONSES.CONNECT_SAFETY_REPORTS_LIST_SUCCESS
      );
    } catch (error) {
      return this.connectService.internalError(
        response,
        apiId,
        "listReports",
        error
      );
    }
  }

  // ---------------------------------------------------------------------
  // B7. PATCH /connect/admin/safety-reports/:id  (admin only)
  // ---------------------------------------------------------------------
  async reviewReport(
    adminId: string,
    id: string,
    dto: UpdateSafetyReportDto,
    response: Response
  ) {
    const apiId = APIID.CONNECT_ADMIN_SAFETY_REPORT_UPDATE;
    const cs = this.connectService;
    try {
      const report = await this.reportRepository.findOne({ where: { id } });
      if (!report) {
        return cs.fail(
          response,
          apiId,
          CONNECT_ERRORS.REPORT_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      report.status = dto.status;
      if (dto.adminNote !== undefined) report.adminNote = dto.adminNote || null;
      report.reviewedBy = adminId;
      report.reviewedAt = new Date();
      const saved = await this.reportRepository.save(report);

      return APIResponse.success(
        response,
        apiId,
        saved,
        HttpStatus.OK,
        API_RESPONSES.CONNECT_SAFETY_REPORT_UPDATED
      );
    } catch (error) {
      return cs.internalError(response, apiId, "reviewReport", error, adminId);
    }
  }

  private findOpenReport(reporterUserId: string, reportedUserId: string) {
    return this.reportRepository.findOne({
      where: {
        reporterUserId,
        reportedUserId,
        status: ConnectReportStatus.OPEN,
      },
      select: ["id", "status", "createdAt"],
    });
  }

  private sendExisting(response: Response, report: SafetyReport) {
    return APIResponse.success(
      response,
      APIID.CONNECT_REPORT_CREATE,
      {
        reportId: report.id,
        status: report.status,
        createdAt: report.createdAt,
      },
      HttpStatus.OK,
      API_RESPONSES.CONNECT_REPORT_ALREADY_OPEN
    );
  }
}
