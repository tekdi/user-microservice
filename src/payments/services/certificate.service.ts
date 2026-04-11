import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpService } from '../../common/utils/http-service';

/** HTTP statuses where a retry may succeed (transient upstream / rate limits). */
function isRetryableCertificateStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableCertificateThrownError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return true;
    }
    return isRetryableCertificateStatus(error.response.status);
  }
  return false;
}

export interface GenerateCertificateDto {
  userId: string;
  courseId: string;
  issuanceDate: string;
  expirationDate: string;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private readonly certificateServiceUrl: string;
  private static readonly MAX_GENERATE_ATTEMPTS = 5;
  private static readonly RETRY_BASE_DELAY_MS = 1000;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.certificateServiceUrl = this.configService.get<string>(
      'ASPIRE_SPECIFIC_SERVICE_URL',
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate certificate for a user after successful payment.
   * Retries on transient failures (network errors, timeouts, 5xx, 408, 429).
   */
  async generateCertificate(data: GenerateCertificateDto): Promise<any> {
    const url = `${this.certificateServiceUrl}/aspirespecific/certificate/generate`;
    const maxAttempts = CertificateService.MAX_GENERATE_ATTEMPTS;
    const baseDelayMs = CertificateService.RETRY_BASE_DELAY_MS;

    this.logger.log(
      `Generating certificate for user ${data.userId} and course ${data.courseId}`,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response;
      try {
        response = await this.httpService.post(url, {
          userId: data.userId,
          courseId: data.courseId,
          issuanceDate: data.issuanceDate,
          expirationDate: data.expirationDate,
        });
      } catch (error) {
        const err = error as Error;
        if (!isRetryableCertificateThrownError(error) || attempt === maxAttempts) {
          this.logger.error(
            `Error generating certificate for user ${data.userId}: ${err.message}`,
            err.stack,
          );
          throw error;
        }
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        this.logger.log(
          `Retrying certificate generation for user ${data.userId}, course ${data.courseId} (attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms backoff)`,
        );
        this.logger.warn(
          `Certificate generate attempt ${attempt}/${maxAttempts} failed (${err.message}), retrying in ${delayMs}ms`,
        );
        await this.delay(delayMs);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `Certificate generated successfully for user ${data.userId}`,
        );
        return response.data;
      }

      if (
        !isRetryableCertificateStatus(response.status) ||
        attempt === maxAttempts
      ) {
        this.logger.error(
          `Failed to generate certificate. Status: ${
            response.status
          }, Response: ${JSON.stringify(response.data)}`,
        );
        throw new Error(
          `Certificate generation failed with status ${response.status}`,
        );
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      this.logger.log(
        `Retrying certificate generation for user ${data.userId}, course ${data.courseId} (attempt ${attempt + 1}/${maxAttempts} after ${delayMs}ms backoff, HTTP ${response.status})`,
      );
      this.logger.warn(
        `Certificate generate attempt ${attempt}/${maxAttempts} returned status ${response.status}, retrying in ${delayMs}ms`,
      );
      await this.delay(delayMs);
    }

    throw new Error('Certificate generation failed after retries');
  }
}
