import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { FormsService } from './forms.service'
import APIResponse from "src/common/responses/response";
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';


describe('Formservice', () => {
  let service: FormsService;
  let fieldsService: PostgresFieldsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsService,
        {
          provide: PostgresFieldsService,
          useValue: {
            getFieldData: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FormsService>(FormsService); 
    fieldsService = module.get<PostgresFieldsService>(PostgresFieldsService); 
  });

  describe('getForm', () => {
    let mockResponse;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      jest.spyOn(APIResponse, 'error').mockImplementation();
      jest.spyOn(APIResponse, 'success').mockImplementation();
      jest.spyOn(service, 'getFormData').mockImplementation();
    });

    it('should return error if context and contextType are missing', async () => {
      const requiredData = {};
      await service.getForm(requiredData, mockResponse);
      expect(APIResponse.error).toHaveBeenCalledWith(
        mockResponse,
        'getFormData',
        'NOT_FOUND',
        'Fields not found for the search term',
        HttpStatus.NOT_FOUND
      );
    });

    it('should return error if no form data found', async () => {
      const requiredData = { context: 'test', contextType: 'test' };
      (service.getFormData as jest.Mock).mockResolvedValue(null);
      await service.getForm(requiredData, mockResponse);
      expect(APIResponse.error).toHaveBeenCalledWith(
        mockResponse,
        'getFormData',
        'NOT_FOUND',
        'No Data found for this context and Context Type',
        HttpStatus.NOT_FOUND
      );
    });

    it('should process and return form data successfully', async () => {
      const requiredData = { context: 'test', contextType: 'test' };
      const mockFormData = {
        fields: {
          result: [
            { fieldId: '1', coreField: true, order: 1 },
            { fieldId: '2', coreField: false, order: 2 },
          ],
        },
      };
      (service.getFormData as jest.Mock).mockResolvedValue(mockFormData);
      (fieldsService.getFieldData as jest.Mock).mockResolvedValue([{ fieldId: '2', someData: 'test' }]);

      await service.getForm(requiredData, mockResponse);

      expect(APIResponse.success).toHaveBeenCalledWith(
        mockResponse,
        'getFormData',
        expect.arrayContaining([
          expect.objectContaining({ fieldId: '1', coreField: true, order: 1 }),
          expect.objectContaining({ fieldId: '2', someData: 'test', order: 2 }),
        ]),
        HttpStatus.OK,
        'Fields fetched successfully.'
      );
    });

    it('should handle errors and return internal server error', async () => {
      const requiredData = { context: 'test', contextType: 'test' };
      (service.getFormData as jest.Mock).mockRejectedValue(new Error('Test error'));

      await service.getForm(requiredData, mockResponse);

      expect(APIResponse.error).toHaveBeenCalledWith(
        mockResponse,
        'getFormData',
        'Internal Server Error',
        'Test error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    });
  });
});