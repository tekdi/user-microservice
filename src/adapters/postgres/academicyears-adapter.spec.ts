import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager, Repository } from 'typeorm';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Response } from 'express';
import { PostgresAcademicYearService } from './academicyears-adapter';
import { AcademicYear } from '../../academicyears/entities/academicyears-entity';
import { AcademicYearSearchDto } from 'src/academicyears/dto/academicyears-search.dto';
import { Tenants } from '../../userTenantMapping/entities/tenant.entity';
import { ConfigModule } from '@nestjs/config';
import { TypeormService } from '../../services/typeorm';
import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';

describe('PostgresAcademicYearService', () => {
    let service: PostgresAcademicYearService;
    let req: Request;
    let responseMock: Partial<Response>;

    beforeAll(async () => {
        responseMock = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }), // Ensure ConfigModule is loaded globally in tests
                TypeOrmModule.forRootAsync({
                    useFactory: async () => ({
                        type: "postgres",
                        host: process.env.POSTGRES_HOST,
                        port: parseInt(process.env.POSTGRES_PORT, 10),
                        username: process.env.POSTGRES_USERNAME,
                        password: process.env.POSTGRES_PASSWORD,
                        database: process.env.POSTGRES_DATABASE,
                        entities: [AcademicYear],
                        synchronize: false, // Auto synchronize (use cautiously in production)
                    }),
                }),
                TypeOrmModule.forFeature([AcademicYear, Tenants]), // Register your repositories

            ],
            providers: [PostgresAcademicYearService, TypeormService, EntityManager],
        }).compile();
        service = module.get<PostgresAcademicYearService>(PostgresAcademicYearService);
        const typeormService = module.get<TypeormService>(TypeormService);
        await typeormService.initialize();
    });

    // to  Clear Mocks Between Tests
    //responseMock object being shared between your test cases. Since jest.spyOn modifies the behavior of the json and status methods of the responseMock object, and responseMock is reused in both test cases, the second test case inherits the behavior and results from the first.
    afterEach(() => {
        jest.clearAllMocks();
    });


    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    //Get academic Year List API - Sucess
    it('should return academic year list when valid tenantId is provided', async () => {
        const tenantId = 'ef99949b-7f3a-4a5f-806a-e67e683e38f3';
        const academicFilter = {};
        const acdemicYearList = jest.spyOn(responseMock, 'json').mockImplementation((result) => {
            return result; // Just return the result passed to json
        });
        await service.getAcademicYearList(academicFilter, tenantId, responseMock as Response);
        const status = jest.spyOn(responseMock, 'status').mockReturnThis();
        const result = acdemicYearList.mock.calls[0][0].result;
        expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    });
    it('should filter academic years by active status when isActive is provided', async () => {
        const tenantId = 'ef99949b-7f3a-4a5f-806a-e67e683e38f3';
        const academicFilter: AcademicYearSearchDto = {
            isActive: false
        }
        const jsonSpy = jest.spyOn(responseMock, 'json').mockImplementation((result) => {
            return result; // Just return the result passed to json
        });
        await service.getAcademicYearList(academicFilter, tenantId, responseMock as Response);
        const status = jest.spyOn(responseMock, 'status').mockReturnThis();
        const result = jsonSpy.mock.calls[0][0].result;
        expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    });
    it('should  not filter if academic years is not exist for tenant', async () => {
        const tenantId = '6c8b810a-66c2-4f0d-8c0c-c025415a4414';
        const academicFilter: AcademicYearSearchDto = {
            isActive: false
        }
        const jsonSpy = jest.spyOn(responseMock, 'json').mockImplementation((result) => {
            return result; // Just return the result passed to json
        });
        await service.getAcademicYearList(academicFilter, tenantId, responseMock as Response);
        const result = jsonSpy.mock.calls[0][0].result;
        expect(result).toEqual({})
    });

    //Get academic Year by Id API - Success
    it('should return academic year when valid academicYearId is provided', async () => {
        const academicYearId = '851687bb-422e-4a22-b27f-6b66fa304bec';
        const academicYearExist = jest.spyOn(responseMock, 'json').mockImplementation((result) => {
            return result; // Just return the result passed to json
        });
        await service.getAcademicYearById(academicYearId, responseMock as Response);
        const status = jest.spyOn(responseMock, 'status').mockReturnThis();
        const result = academicYearExist.mock.calls[0][0].result;
        expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    });

});
