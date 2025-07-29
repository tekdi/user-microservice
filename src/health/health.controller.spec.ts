import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DataSource } from 'typeorm';
import { Response } from 'express';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: DataSource;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    const mockDataSource = {
      query: jest.fn(),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return healthy status when database is accessible', async () => {
    // Mock successful database query
    jest.spyOn(dataSource, 'query').mockResolvedValue([{}]);

    await controller.checkHealth(mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'api.content.health',
        ver: '3.0',
        params: expect.objectContaining({
          status: 'successful',
          err: null,
          errmsg: null,
        }),
        responseCode: 'OK',
        result: expect.objectContaining({
          healthy: true,
          checks: [{ name: 'postgres db', healthy: true }],
        }),
      })
    );
  });

  it('should return unhealthy status when database is not accessible', async () => {
    // Mock failed database query
    jest.spyOn(dataSource, 'query').mockRejectedValue(new Error('Connection failed'));

    await controller.checkHealth(mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(503);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'api.content.health',
        ver: '3.0',
        params: expect.objectContaining({
          status: 'failed',
          err: 'DATABASE_CONNECTION_ERROR',
          errmsg: 'Connection failed',
        }),
        responseCode: 'SERVICE_UNAVAILABLE',
        result: expect.objectContaining({
          healthy: false,
          checks: [{ name: 'postgres db', healthy: false }],
        }),
      })
    );
  });

  it('should include timestamp and resmsgid in response', async () => {
    jest.spyOn(dataSource, 'query').mockResolvedValue([{}]);

    await controller.checkHealth(mockResponse as Response);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        params: expect.objectContaining({
          resmsgid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
        }),
      })
    );
  });
});