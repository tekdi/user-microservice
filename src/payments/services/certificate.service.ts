import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '../../common/utils/http-service';

export interface GenerateCertificateDto {
  userId: string;
  courseId: string;
  firstName: string;
  lastName: string;
  issuanceDate: string;
  expirationDate: string;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private readonly certificateServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.certificateServiceUrl = this.configService.get<string>(
      'ASPIRE_SPECIFIC_SERVICE_URL',
    );
  }

  /**
   * Generate certificate for a user after successful payment
   */
  async generateCertificate(data: GenerateCertificateDto): Promise<any> {
    const url = `${this.certificateServiceUrl}/aspirespecific/certificate/generate`;

    this.logger.log(
      `Generating certificate for user ${data.userId} and course ${data.courseId}`,
    );

    try {
      const response = await this.httpService.post(url, {
        userId: data.userId,
        courseId: data.courseId,
        firstName: data.firstName,
        lastName: data.lastName,
        issuanceDate: data.issuanceDate,
        expirationDate: data.expirationDate,
      });

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `Certificate generated successfully for user ${data.userId}`,
        );
        return response.data;
      } else {
        this.logger.error(
          `Failed to generate certificate. Status: ${
            response.status
          }, Response: ${JSON.stringify(response.data)}`,
        );
        throw new Error(
          `Certificate generation failed with status ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error generating certificate for user ${data.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
