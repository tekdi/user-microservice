import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AllExceptionsFilter } from '../common/filters/exception.filter';
import { APIID } from '../common/utils/api-id.config';
import { PaymentService } from './services/payment.service';
import { GenerateCertificateRequestDto } from './dtos/generate-certificate-request.dto';

@ApiTags('Certificate')
@Controller('certificate')
export class CertificateController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('generate')
  @UseFilters(new AllExceptionsFilter(APIID.CERTIFICATE_GENERATE))
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate certificate and unlock payment targets',
    description:
      'Calls the Aspire certificate service /aspirespecific/certificate/generate. On success, unlocks all locked payment targets for the payment intent associated with transactionId. userId must match the intent; courseId must equal context_id on at least one row in payment_targets for that intent.',
  })
  @ApiBody({ type: GenerateCertificateRequestDto })
  @ApiOkResponse({
    description: 'Certificate generated and targets unlocked',
    schema: {
      type: 'object',
      properties: {
        certificate: { type: 'object', description: 'Upstream certificate service response' },
        paymentIntentId: { type: 'string', format: 'uuid' },
        transactionId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or userId/courseId does not match the transaction intent',
  })
  @ApiNotFoundResponse({ description: 'Transaction not found' })
  async generateCertificate(@Body() dto: GenerateCertificateRequestDto) {
    return await this.paymentService.generateCertificateAndUnlockTargets(dto);
  }
}
