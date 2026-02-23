import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PaymentIntent } from './entities/payment-intent.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentTarget } from './entities/payment-target.entity';
import { DiscountCoupon } from './entities/discount-coupon.entity';
import { CouponRedemption } from './entities/coupon-redemption.entity';
import { User } from '../user/entities/user-entity';
import { PaymentsController } from './payments.controller';
import { CouponController } from './controllers/coupon.controller';
import { StripeWebhookController } from './webhooks/stripe.webhook.controller';
import { PaymentService } from './services/payment.service';
import { PaymentIntentService } from './services/payment-intent.service';
import { PaymentTransactionService } from './services/payment-transaction.service';
import { PaymentTargetService } from './services/payment-target.service';
import { CertificateService } from './services/certificate.service';
import { CouponService } from './services/coupon.service';
import { UserAdapter } from '../user/useradapter';
import { PostgresModule } from '../adapters/postgres/postgres-module';
import { HttpService } from '../common/utils/http-service';
import { StripeProvider } from './providers/stripe/stripe.provider';

/**
 * Payments Module
 * 
 * Provides payment processing functionality with support for multiple providers.
 * Currently supports Stripe, with extensible architecture for Razorpay/PayPal.
 * 
 * Features:
 * - Payment intent creation
 * - Stripe Checkout integration
 * - Webhook handling with idempotency
 * - Payment status tracking
 * - Entitlement unlocking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentIntent,
      PaymentTransaction,
      PaymentTarget,
      DiscountCoupon,
      CouponRedemption,
      User,
    ]),
    ConfigModule,
    PostgresModule,
  ],
  controllers: [PaymentsController, CouponController, StripeWebhookController],
  providers: [
    PaymentService,
    PaymentIntentService,
    PaymentTransactionService,
    PaymentTargetService,
    CertificateService,
    CouponService,
    UserAdapter,
    HttpService,
    {
      provide: 'PaymentProvider',
      useClass: StripeProvider,
    },
  ],
  exports: [PaymentService, CouponService],
})
export class PaymentsModule implements OnModuleInit {
  private readonly logger = new Logger(PaymentsModule.name);

  onModuleInit() {
    this.logger.log('PaymentsModule initialized successfully');
    this.logger.log('PaymentsModule controllers loaded: PaymentsController, CouponController, StripeWebhookController');
    this.logger.log('PaymentsModule providers loaded: PaymentService, PaymentIntentService, PaymentTransactionService, PaymentTargetService, CouponService, StripeProvider');
    this.logger.log('PaymentsModule entities registered: PaymentIntent, PaymentTransaction, PaymentTarget, DiscountCoupon, CouponRedemption');
    this.logger.debug('PaymentsModule is properly configured and ready to handle payment requests');
  }
}

