import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('health')
  async checkHealth(@Res() res: Response) {
    const resmsgid = uuidv4();
    const timestamp = new Date().toISOString();
    
    let healthy = true;
    let responseCode = 'OK';
    let status = 'successful';
    let err = null;
    let errmsg = null;

    const checks = [];

    try {
      // Check PostgreSQL database connectivity
      await this.dataSource.query('SELECT 1');
      checks.push({ name: 'postgres db', healthy: true });
    } catch (error) {
      healthy = false;
      responseCode = 'SERVICE_UNAVAILABLE';
      status = 'failed';
      err = 'DATABASE_CONNECTION_ERROR';
      errmsg = error.message;
      checks.push({ name: 'postgres db', healthy: false });
    }

    const response = {
      id: 'api.content.health',
      ver: '3.0',
      ts: timestamp,
      params: {
        resmsgid,
        msgid: null,
        err,
        status,
        errmsg,
      },
      responseCode,
      result: {
        checks,
        healthy,
      },
    };

    // Set appropriate HTTP status code
    const httpStatus = healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(httpStatus).json(response);
  }
}