import { Controller, Post, Body, Res, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { SsoService } from './sso.service';
import { SsoRequestDto } from './dto/sso-request.dto';
import { APIID } from '../common/utils/api-id.config';
import APIResponse from '../common/responses/response';

@ApiTags('SSO Authentication')
@Controller('sso')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @Post('authenticate')
  @ApiOperation({
    summary: 'SSO Authentication',
    description: 'Authenticate user through SSO and create user in database if new'
  })
  @ApiBody({ type: SsoRequestDto })
  @ApiResponse({
    status: 200,
    description: 'User authenticated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'api.login' },
        ver: { type: 'string', example: '1.0' },
        ts: { type: 'string', example: '2025-01-15T10:30:00.000Z' },
        params: {
          type: 'object',
          properties: {
            resmsgid: { type: 'string' },
            status: { type: 'string', example: 'successful' },
            err: { type: 'null' },
            errmsg: { type: 'null' },
            successmessage: { type: 'string', example: 'Auth Token fetched Successfully.' }
          }
        },
        responseCode: { type: 'number', example: 200 },
        result: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_in: { type: 'number', example: 86400 },
            refresh_expires_in: { type: 'number', example: 604800 },
            token_type: { type: 'string', example: 'Bearer' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Newton API authentication failed'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data'
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error'
  })
  async authenticate(
    @Body() ssoRequestDto: SsoRequestDto,
    @Res() response: Response
  ) {
    try {
      const result = await this.ssoService.authenticate(ssoRequestDto);
      
      // Return the standard API response format directly from the service
      // The service now returns the exact format specified in Step 5 of the workflow
      return response.status(HttpStatus.OK).json(result);
      
    } catch (error) {
      // Properly handle HttpException to preserve status codes
      if (error instanceof HttpException) {
        const status = error.getStatus();
        const errorResponse = error.getResponse();
        const message = typeof errorResponse === 'string' 
          ? errorResponse 
          : (errorResponse as any)?.message || error.message;
        
        return APIResponse.error(
          response,
          APIID.SSO_AUTHENTICATE,
          message || 'SSO authentication failed',
          error.name || 'BAD_REQUEST',
          status
        );
      }
      
      // Fallback for non-HttpException errors
      return APIResponse.error(
        response,
        APIID.SSO_AUTHENTICATE,
        error.message || 'SSO authentication failed',
        'INTERNAL_SERVER_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
