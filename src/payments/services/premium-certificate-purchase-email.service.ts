import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationRequest } from '@utils/notification.axios';
import { User } from '../../user/entities/user-entity';
import { PaymentIntentService } from './payment-intent.service';
import { PaymentTransactionStatus } from '../enums/payment.enums';

function isSendEmailAfterPaymentSuccessEnabled(
  configService: ConfigService,
): boolean {
  const raw = configService.get<string>('SEND_EMAIL_AFTER_PAYMENT_SUCCESS');
  return String(raw).toLowerCase() === 'true';
}

function extractDownloadUrlFromCertificateResponse(data: unknown): string {
  if (data == null || typeof data !== 'object') {
    return '';
  }
  const o = data as Record<string, unknown>;
  const direct = [
    o.downloadUrl,
    o.downloadURL,
    o.certificateDownloadUrl,
    o.url,
  ].find((v) => typeof v === 'string' && v.length > 0) as string | undefined;
  if (direct) {
    return direct;
  }
  const nestedKeys = ['data', 'certificate', 'result', 'payload'] as const;
  for (const key of nestedKeys) {
    const nested = o[key];
    if (nested != null && typeof nested === 'object') {
      const inner = extractDownloadUrlFromCertificateResponse(nested);
      if (inner) {
        return inner;
      }
    }
  }
  return '';
}

function displayNameFromUser(user: User): string {
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  const combined = `${first} ${last}`.trim();
  return combined || user.username || user.userId;
}

@Injectable()
export class PremiumCertificatePurchaseEmailService {
  private readonly logger = new Logger(
    PremiumCertificatePurchaseEmailService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly notificationRequest: NotificationRequest,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly paymentIntentService: PaymentIntentService,
  ) {}

  /**
   * Sends OnPremiumCertificatePurchased when SEND_EMAIL_AFTER_PAYMENT_SUCCESS=true.
   * Swallows errors so payment/certificate success is never rolled back or failed by email.
   */
  async sendPremiumCertificatePurchasedIfEnabled(params: {
    userId: string;
    paymentIntentId: string;
    certificateApiResponse: unknown;
  }): Promise<void> {
    if (!isSendEmailAfterPaymentSuccessEnabled(this.configService)) {
      this.logger.log(
        `Skipping premium certificate purchase email for intent ${params.paymentIntentId} because SEND_EMAIL_AFTER_PAYMENT_SUCCESS is not enabled`,
      );
      return;
    }

    try {
      const user = await this.userRepository.findOne({
        where: { userId: params.userId },
      });
      if (!user?.email) {
        this.logger.warn(
          `Skipping premium certificate email: no email for user ${params.userId}`,
        );
        return;
      }

      const intent = await this.paymentIntentService.findById(
        params.paymentIntentId,
      );

      const successTransactions = (intent.transactions ?? []).filter(
        (t) => t.status === PaymentTransactionStatus.SUCCESS,
      );
      const latestSuccess = [...successTransactions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      const providerPaymentId = latestSuccess?.providerPaymentId ?? '';

      let paidAtDate: Date;
      if (latestSuccess?.createdAt) {
        paidAtDate = new Date(latestSuccess.createdAt);
      } else {
        this.logger.warn(
          `No SUCCESS transaction with createdAt for intent ${params.paymentIntentId}; paidAt falls back to payment intent timestamps`,
        );
        paidAtDate = intent.updatedAt
          ? new Date(intent.updatedAt)
          : new Date(intent.createdAt);
      }

      const amountPaid = Number(intent.amount).toFixed(2);
      const currency = (intent.currency || 'USD').toUpperCase();
      const paidAt = paidAtDate.toISOString();
      const downloadUrl = extractDownloadUrlFromCertificateResponse(
        params.certificateApiResponse,
      );

      const notificationPayload = {
        isQueue: false,
        context: 'CERTIFICATE',
        key: 'OnPremiumCertificatePurchased',
        replacements: {
          '{userName}': displayNameFromUser(user),
          '{downloadUrl}': downloadUrl,
          '{orderId}': params.paymentIntentId,
          '{transactionId}': providerPaymentId,
          '{amountPaid}': amountPaid,
          '{currency}': currency,
          '{paidAt}': paidAt,
        },
        email: {
          receipients: [user.email],
        },
      };

      this.logger.log(
        `Sending premium certificate purchase email (OnPremiumCertificatePurchased) for intent ${params.paymentIntentId}`,
      );

      const mailSend = await this.notificationRequest.sendNotification(
        notificationPayload,
      );

      const errors = mailSend?.result?.email?.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        this.logger.error(
          `Premium certificate purchase email reported errors for intent ${params.paymentIntentId}: ${JSON.stringify(errors)}`,
        );
        return;
      }

      this.logger.log(
        `Premium certificate purchase email sent for intent ${params.paymentIntentId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send premium certificate purchase email for intent ${params.paymentIntentId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
