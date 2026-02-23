import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CouponService } from '../services/coupon.service';
import { CreateCouponDto, UpdateCouponDto } from '../dtos/create-coupon.dto';
import { ValidateCouponDto, ValidateCouponResponseDto } from '../dtos/validate-coupon.dto';
import { DiscountCoupon } from '../entities/discount-coupon.entity';
import { PaymentContextType } from '../enums/payment.enums';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new discount coupon' })
  @ApiResponse({
    status: 201,
    description: 'Coupon created successfully',
    type: DiscountCoupon,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or coupon already exists' })
  async createCoupon(@Body() dto: CreateCouponDto): Promise<DiscountCoupon> {
    return await this.couponService.createCoupon(dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a coupon code' })
  @ApiResponse({
    status: 200,
    description: 'Coupon validation result',
    type: ValidateCouponResponseDto,
  })
  async validateCoupon(
    @Body() dto: ValidateCouponDto,
  ): Promise<ValidateCouponResponseDto> {
    return await this.couponService.validateCoupon(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all coupons' })
  @ApiResponse({
    status: 200,
    description: 'List of coupons',
    type: [DiscountCoupon],
  })
  async listCoupons(
    @Query('contextType') contextType?: PaymentContextType,
    @Query('contextId') contextId?: string,
    @Query('isActive') isActive?: string,
  ): Promise<DiscountCoupon[]> {
    let isActiveBoolean: boolean | undefined;
    if (isActive === 'true') {
      isActiveBoolean = true;
    } else if (isActive === 'false') {
      isActiveBoolean = false;
    } else {
      isActiveBoolean = undefined;
    }

    return await this.couponService.listCoupons({
      contextType,
      contextId,
      isActive: isActiveBoolean,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by ID' })
  @ApiResponse({
    status: 200,
    description: 'Coupon details',
    type: DiscountCoupon,
  })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCouponById(@Param('id') id: string): Promise<DiscountCoupon> {
    const coupon = await this.couponService.getCouponById(id);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get coupon by code' })
  @ApiResponse({
    status: 200,
    description: 'Coupon details',
    type: DiscountCoupon,
  })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCouponByCode(@Param('code') code: string): Promise<DiscountCoupon> {
    const coupon = await this.couponService.getCouponByCode(code);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  @ApiResponse({
    status: 200,
    description: 'Coupon updated successfully',
    type: DiscountCoupon,
  })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async updateCoupon(
    @Param('id') id: string,
    @Body() updates: UpdateCouponDto,
  ): Promise<DiscountCoupon> {
    return await this.couponService.updateCoupon(id, updates);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a coupon' })
  @ApiResponse({ status: 204, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async deleteCoupon(@Param('id') id: string): Promise<void> {
    await this.couponService.deleteCoupon(id);
  }

  @Post(':id/sync-stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync coupon to Stripe' })
  @ApiResponse({ status: 200, description: 'Coupon synced to Stripe successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async syncCouponToStripe(@Param('id') id: string): Promise<{ message: string }> {
    const coupon = await this.couponService.getCouponById(id);
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    await this.couponService.syncCouponToStripe(coupon);
    return { message: 'Coupon synced to Stripe successfully' };
  }
}

