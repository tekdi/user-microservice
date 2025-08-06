import {
  Injectable,
  HttpStatus,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import {
  FormSubmission,
  FormSubmissionStatus,
} from '../entities/form-submission.entity';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { FieldValues } from '../../fields/entities/fields-values.entity';
import { Fields, FieldType } from '../../fields/entities/fields.entity';
import APIResponse from '../../common/responses/response';
import { Response } from 'express';
import { API_RESPONSES } from '../../common/utils/response.messages';
import { FieldsService } from '../../fields/fields.service';
import { FieldValuesDto } from '../../fields/dto/field-values.dto';
import { ErrorResponseTypeOrm } from '../../error-response-typeorm';
import { isUUID } from 'class-validator';
import { FormSubmissionSearchDto } from '../dto/form-submission-search.dto';
import { FieldValuesSearchDto } from '../../fields/dto/field-values-search.dto';
import { FieldsSearchDto } from '../../fields/dto/fields-search.dto';
import jwt_decode from 'jwt-decode';
import { Form } from '../entities/form.entity';
import { UserElasticsearchService } from '../../elasticsearch/user-elasticsearch.service';
import { ElasticsearchDataFetcherService } from '../../elasticsearch/elasticsearch-data-fetcher.service';
import { FormsService } from '../../forms/forms.service';
import { PostgresCohortService } from 'src/adapters/postgres/cohort-adapter';
import { IUser } from '../../elasticsearch/interfaces/user.interface';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
import { isElasticsearchEnabled } from 'src/common/utils/elasticsearch.util';
import { CohortMembers } from 'src/cohortMembers/entities/cohort-member.entity';
import { Cohort } from 'src/cohort/entities/cohort.entity';

interface DateRange {
  start: string;
  end: string;
}

interface FilterValue {
  value: string | number | boolean | DateRange;
  type: 'string' | 'number' | 'boolean' | 'date';
}

interface CustomFieldFilters {
  [fieldId: string]: string | number | boolean | string[];
}

interface FormSubmissionFilters {
  status?: string | string[];
  submissionId?: string;
  formId?: string;
  itemId?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string | DateRange;
  updatedAt?: string | DateRange;
  customFieldsFilter?: CustomFieldFilters;
  completionPercentage?: string[];
}

interface FieldSearchResult {
  data: Fields[];
  responseCode: number;
}

interface FieldSearchResponse {
  data: Fields[];
  [key: string]: any;
}

@Injectable()
export class FormSubmissionService {
  private readonly logger = new Logger(FormSubmissionService.name);
  
  constructor(
    @InjectRepository(FormSubmission)
    private formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    @InjectRepository(CohortMembers)
    private cohortMembersRepository: Repository<CohortMembers>,
    @InjectRepository(Cohort)
    private cohortRepository: Repository<Cohort>,
    private readonly fieldsService: FieldsService,
    private readonly userElasticsearchService: UserElasticsearchService,
    private readonly elasticsearchDataFetcherService: ElasticsearchDataFetcherService,
    private readonly formsService: FormsService,
    @Inject(forwardRef(() => PostgresCohortService))
    private readonly postgresCohortService: PostgresCohortService
  ) {}

  async create(
    createFormSubmissionDto: CreateFormSubmissionDto,
    response: Response
  ) {
    try {
      // Get user ID from token
      const decoded: any = jwt_decode(response.req.headers.authorization);
      const userId = decoded?.sub;

      if (!userId) {
        throw new BadRequestException('User ID not found in token');
      }

      // Check if form exists and is active
      const form = await this.formRepository.findOne({
        where: {
          formid: createFormSubmissionDto.formSubmission.formId,
          status: 'active',
        },
      });

      if (!form) {
        return APIResponse.error(
          response,
          'api.form.submission.create',
          'BAD_REQUEST',
          'Form with the provided formId does not exist or is not active',
          HttpStatus.BAD_REQUEST
        );
      }

      // Check for existing active/inactive submissions with same formId and itemId
      const existingSubmission = await this.formSubmissionRepository.findOne({
        where: {
          formId: createFormSubmissionDto.formSubmission.formId,
          itemId: userId,
          status: In([
            FormSubmissionStatus.ACTIVE,
            FormSubmissionStatus.INACTIVE,
          ]),
        },
      });

      if (existingSubmission) {
        return APIResponse.error(
          response,
          'api.form.submission.create',
          'BAD_REQUEST',
          'Application with this formId and userId already exists with status ACTIVE or INACTIVE',
          HttpStatus.BAD_REQUEST
        );
      }

      // Create form submission
      const formSubmission = new FormSubmission();
      formSubmission.formId = createFormSubmissionDto.formSubmission.formId;
      formSubmission.itemId = userId;
      formSubmission.status =
        createFormSubmissionDto.formSubmission.status ||
        FormSubmissionStatus.ACTIVE;
      formSubmission.createdBy = userId;
      formSubmission.updatedBy = userId;

      // Add completionPercentage if provided
      if (
        createFormSubmissionDto.formSubmission.completionPercentage !==
        undefined
      ) {
        formSubmission.completionPercentage =
          createFormSubmissionDto.formSubmission.completionPercentage;
      }

      const savedSubmission = await this.formSubmissionRepository.save(
        formSubmission
      );

      // Save field values using FieldsService
      for (const fieldValue of createFormSubmissionDto.customFields) {
        const fieldValueDto = new FieldValuesDto({
          fieldId: fieldValue.fieldId,
          value: fieldValue.value,
          itemId: savedSubmission.itemId,
          createdBy: userId,
          updatedBy: userId,
        });

        const result = await this.fieldsService.createFieldValues(
          null,
          fieldValueDto
        );
        if (result instanceof ErrorResponseTypeOrm) {
          throw new BadRequestException(result.errorMessage);
        }
      }

      // Get the complete field values with field information
      const customFields = await this.fieldsService.getFieldsAndFieldsValues(
        savedSubmission.itemId,
        createFormSubmissionDto.formSubmission.formId // Pass formId for checkbox processing
      );

      // Update Elasticsearch with complete field values from database (includes dependencies)
      // Only update if Elasticsearch is enabled
      if (isElasticsearchEnabled()) {
        await this.updateApplicationInElasticsearch(
          userId,
          savedSubmission,
          customFields // Fixed: now passes all fields from DB
        );
      }

      // Create response object
      const responseData = {
        id: 'api.form.submission.create',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: savedSubmission.submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Form saved successfully',
        },
        responseCode: HttpStatus.CREATED,
        result: {
          formSubmission: savedSubmission,
          customFields,
        },
      };

      return response.status(HttpStatus.CREATED).json(responseData);
    } catch (error) {
      return APIResponse.error(
        response,
        'api.form.submission.create',
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async buildWhereClause(
    filters: FormSubmissionFilters,
    formSubmissionKeys: string[]
  ) {
    const whereClause: any = {};
    if (!filters || Object.keys(filters).length === 0) {
      return whereClause;
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'customFieldsFilter' || !value) {
        return;
      }

      if (!formSubmissionKeys.includes(key)) {
        throw new BadRequestException(`Invalid filter key: ${key}`);
      }

      // Handle different types of filters
      if (key === 'status') {
        if (Array.isArray(value)) {
          whereClause[key] = In(
            value.map((status: string) => status.toLowerCase())
          );
        } else if (typeof value === 'string') {
          whereClause[key] = value.toLowerCase();
        }
      }
      // Handle completion percentage ranges
      else if (key === 'completionPercentage') {
        if (Array.isArray(value) && value.length > 0) {
          // Validate each range in the array
          value.forEach((range: string, index: number) => {
            const [min, max] = range.split('-').map(Number);
            if (isNaN(min) || isNaN(max) || min < 0 || max > 100 || min > max) {
              throw new BadRequestException(
                `Invalid completion percentage range at index ${index}: ${range}. Must be in format "min-max" where 0 <= min <= max <= 100`
              );
            }
          });
          whereClause[key] = value;
        }
      }
      // Handle UUID fields (exact match)
      else if (
        ['submissionId', 'formId', 'itemId', 'createdBy', 'updatedBy'].includes(
          key
        )
      ) {
        if (value && !isUUID(value as string)) {
          throw new BadRequestException(`Invalid UUID format for ${key}`);
        }
        whereClause[key] = value;
      }
      // Handle date fields
      else if (['createdAt', 'updatedAt'].includes(key)) {
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const dateRange = value as DateRange;
          if (
            dateRange.start &&
            dateRange.end &&
            typeof dateRange.start === 'string' &&
            typeof dateRange.end === 'string'
          ) {
            const startDate = new Date(dateRange.start);
            const endDate = new Date(dateRange.end);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              throw new BadRequestException(`Invalid date format for ${key}`);
            }

            whereClause[key] = Between(startDate, endDate);
          }
        } else if (typeof value === 'string') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid date format for ${key}`);
          }
          whereClause[key] = date;
        }
      }
      // Default case
      else {
        whereClause[key] = value;
      }
    });

    return whereClause;
  }

  private async fetchSubmissionsWithPagination(
    whereClause: any,
    sort: any[],
    offset: number,
    limit: number
  ) {
    // Handle completion percentage ranges separately
    const { completionPercentage, ...otherFilters } = whereClause;
    let queryBuilder = this.formSubmissionRepository.createQueryBuilder('fs');

    // Apply other filters
    Object.entries(otherFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryBuilder.andWhere(`fs.${key} IN (:...${key})`, { [key]: value });
        } else {
          queryBuilder.andWhere(`fs.${key} = :${key}`, { [key]: value });
        }
      }
    });

    // Handle completion percentage ranges (only if present in whereClause)
    if (
      completionPercentage &&
      Array.isArray(completionPercentage) &&
      completionPercentage.length > 0
    ) {
      // Multiple ranges - use OR conditions (union) with proper casting
      const rangeConditions = completionPercentage.map((range, index) => {
        const [min, max] = range.split('-').map(Number);
        return `(CAST(fs.completionPercentage AS DECIMAL(5,2)) >= :min${index} AND CAST(fs.completionPercentage AS DECIMAL(5,2)) <= :max${index})`;
      });

      const parameters = {};
      completionPercentage.forEach((range, index) => {
        const [min, max] = range.split('-').map(Number);
        parameters[`min${index}`] = min;
        parameters[`max${index}`] = max;
      });

      queryBuilder.andWhere(`(${rangeConditions.join(' OR ')})`, parameters);
    }

    // Apply sorting and pagination
    if (sort?.length === 2) {
      queryBuilder.orderBy(
        `fs.${sort[0]}`,
        sort[1].toUpperCase() as 'ASC' | 'DESC'
      );
    } else {
      queryBuilder.orderBy('fs.createdAt', 'DESC');
    }

    queryBuilder.skip(offset).take(limit);

    return await queryBuilder.getManyAndCount();
  }

  private async applyCustomFieldFilters(
    submissions: FormSubmission[],
    filters: FormSubmissionFilters,
    offset: number,
    limit: number
  ) {
    if (
      !filters?.customFieldsFilter ||
      Object.keys(filters.customFieldsFilter).length === 0
    ) {
      return {
        filteredSubmissions: submissions,
        filteredCount: submissions.length,
      };
    }

    const customFieldFilters = filters.customFieldsFilter;

    // Get all field definitions first to validate field types
    const fieldIds = Object.keys(customFieldFilters);

    // Get field definitions for each field ID
    const fieldDefinitions: Fields[] = [];
    for (const fieldId of fieldIds) {
      try {
        // Get field definition directly using fieldId
        const fieldDefinition = await this.fieldsService.getFieldById(fieldId);

        if (!fieldDefinition) {
          throw new BadRequestException(`Field not found with ID: ${fieldId}`);
        }

        fieldDefinitions.push(fieldDefinition);
      } catch (error) {
        throw new BadRequestException(
          `Failed to fetch field definition for ${fieldId}: ${error.message}`
        );
      }
    }

    if (fieldDefinitions.length === 0) {
      return {
        filteredSubmissions: [],
        filteredCount: 0,
      };
    }

    // Create a map of fieldId to field definition
    const fieldDefinitionMap = new Map(
      fieldDefinitions.map((field: Fields) => [field.fieldId, field])
    );

    // Build query with joins
    const queryBuilder = this.formSubmissionRepository
      .createQueryBuilder('fs')
      .leftJoin(FieldValues, 'fv', 'fv.itemId = fs.itemId')
      .leftJoin(Fields, 'f', 'f.fieldId = fv.fieldId')
      .select('fs'); // Select all columns from form submission

    // Add conditions for each custom field filter
    Object.entries(customFieldFilters).forEach(([fieldId, expectedValue]) => {
      const fieldDef = fieldDefinitionMap.get(fieldId);
      if (!fieldDef) {
        throw new BadRequestException(`Invalid field ID: ${fieldId}`);
      }

      const fieldType = fieldDef.type;
      switch (fieldType) {
        case FieldType.NUMERIC:
          const numValue = Number(expectedValue);
          if (isNaN(numValue)) {
            throw new BadRequestException(
              `Invalid numeric value for field ${fieldDef.label}`
            );
          }
          // Check numberValue column first, then fall back to value column
          queryBuilder.andWhere(
            'fv.fieldId = :fieldId AND (fv.numberValue = :numValue OR CAST(fv.value AS DECIMAL) = :numValue)',
            {
              fieldId,
              numValue,
            }
          );
          break;

        case FieldType.CALENDAR:
          try {
            if (!expectedValue) {
              throw new Error('Date value is required');
            }

            // Format the date value
            let dateStr = expectedValue as string;
            if (dateStr.includes(' ') && !dateStr.includes('T')) {
              dateStr = dateStr.replace(' ', 'T');
            }

            const dateValue = new Date(dateStr);
            if (isNaN(dateValue.getTime())) {
              throw new Error('Invalid date format');
            }

            // Check calendarValue column first, then fall back to value column
            const formattedDate = dateValue.toISOString().split('T')[0];
            queryBuilder.andWhere(
              'fv.fieldId = :fieldId AND (DATE(fv.calendarValue) = DATE(:dateValue::timestamp) OR DATE(fv.value::timestamp) = DATE(:dateValue::timestamp))',
              {
                fieldId,
                dateValue: formattedDate,
              }
            );
          } catch (error) {
            throw new BadRequestException(
              `Invalid date value for field ${fieldDef.label}: ${error.message}`
            );
          }
          break;

        case FieldType.CHECKBOX:
          // Check checkboxValue column first, then fall back to value column
          const boolValue = Boolean(expectedValue);
          queryBuilder.andWhere(
            'fv.fieldId = :fieldId AND (fv.checkboxValue = :boolValue OR CAST(fv.value AS BOOLEAN) = :boolValue)',
            {
              fieldId,
              boolValue,
            }
          );
          break;

        case FieldType.DROPDOWN:
          // Check dropdownValue column first, then fall back to value column
          if (Array.isArray(expectedValue)) {
            if (expectedValue.length === 0) {
              throw new BadRequestException(
                `Empty array value for dropdown field ${fieldDef.label}`
              );
            }
            const values = expectedValue.map((v) => v.toString());
            queryBuilder.andWhere(
              'fv.fieldId = :fieldId AND (fv.dropdownValue ? :values OR fv.value IN (:...values))',
              {
                fieldId,
                values,
              }
            );
          } else {
            const value = expectedValue.toString();
            queryBuilder.andWhere(
              'fv.fieldId = :fieldId AND (fv.dropdownValue ? :value OR fv.value = :value)',
              {
                fieldId,
                value,
              }
            );
          }
          break;

        case FieldType.TEXT:
          {
            // Check textValue column first, then fall back to value column with ILIKE
            const textSearchValue = expectedValue.toString();
            queryBuilder.andWhere(
              'fv.fieldId = :fieldId AND (fv.textValue ILIKE :textSearchValue OR fv.value ILIKE :textSearchValue)',
              {
                fieldId,
                textSearchValue: `%${textSearchValue}%`,
              }
            );
          }
          break;

        case FieldType.TEXTAREA: {
          // Check textareaValue column first, then fall back to value column with ILIKE
          const textareaSearchValue = expectedValue.toString();
          queryBuilder.andWhere(
            'fv.fieldId = :fieldId AND (fv.textareaValue ILIKE :textareaSearchValue OR fv.value ILIKE :textareaSearchValue)',
            {
              fieldId,
              textareaSearchValue: `%${textareaSearchValue}%`,
            }
          );
          break;
        }
        case FieldType.RADIO:
          {
            // Check radioValue column first, then fall back to value column
            const radioValue = expectedValue.toString();
            queryBuilder.andWhere(
              'fv.fieldId = :fieldId AND (fv.radioValue = :radioValue OR fv.value = :radioValue)',
              {
                fieldId,
                radioValue,
              }
            );
          }
          break;

        default:
          // For any other type, check value column with case-insensitive comparison
          queryBuilder.andWhere(
            'fv.fieldId = :fieldId AND LOWER(fv.value) = LOWER(:defaultValue)',
            {
              fieldId,
              defaultValue: expectedValue.toString(),
            }
          );
      }
    });

    // Add sorting and pagination
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const [results, total] = await queryBuilder.getManyAndCount();

    return {
      filteredSubmissions: results,
      filteredCount: total,
    };
  }

  private async formatSubmissionResponse(
    submissions: FormSubmission[],
    includeDisplayValues: boolean,
    totalCount: number,
    filteredCount: number
  ) {
    const formSubmissions = await Promise.all(
      submissions.map(async (submission) => {
        const result: any = {
          submissionId: submission.submissionId,
          formId: submission.formId,
          itemId: submission.itemId,
          status: submission.status,
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
          createdBy: submission.createdBy,
          updatedBy: submission.updatedBy,
          completionPercentage: submission.completionPercentage,
        };

        if (includeDisplayValues) {
          result.customFields =
            await this.fieldsService.getFieldsAndFieldsValues(
              submission.itemId,
              submission.formId // Pass formId for checkbox processing
            );
        }

        return result;
      })
    );

    return {
      id: 'api.form.submission.search',
      ver: '1.0',
      ts: new Date().toISOString(),
      params: {
        resmsgid: '',
        status: 'successful',
        err: null,
        errmsg: null,
        successmessage: 'Form submissions retrieved successfully',
      },
      responseCode: HttpStatus.OK,
      result: {
        totalCount,
        count: filteredCount,
        formSubmissions,
      },
    };
  }

  async findAll(formSubmissionSearchDto: FormSubmissionSearchDto) {
    try {
      let { limit, offset, filters, sort, includeDisplayValues } =
        formSubmissionSearchDto;

      // Convert limit and offset to numbers and set default values
      offset = Number(offset) || 0;
      limit = Number(limit) || 10;

      // Validate limit and offset
      if (isNaN(limit) || isNaN(offset) || limit < 0 || offset < 0) {
        throw new BadRequestException(
          'Invalid limit or offset value. Must be non-negative numbers.'
        );
      }

      // Get all valid form submission fields for filtering
      const formSubmissionKeys =
        this.formSubmissionRepository.metadata.columns.map(
          (column) => column.propertyName
        );

      // Build where clause
      const whereClause = await this.buildWhereClause(
        filters,
        formSubmissionKeys
      );

      // Get form submissions with pagination
      const [submissions, totalCount] =
        await this.fetchSubmissionsWithPagination(
          whereClause,
          sort,
          offset,
          limit
        );

      // Apply custom field filters if any
      const { filteredSubmissions, filteredCount } =
        await this.applyCustomFieldFilters(submissions, filters, offset, limit);

      // Format and return response
      return await this.formatSubmissionResponse(
        filteredSubmissions,
        includeDisplayValues,
        totalCount,
        filteredCount
      );
    } catch (error) {
      console.error('Error in findAll:', error);
      return {
        id: 'api.form.submission.search',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: '',
          status: 'failed',
          err: 'SEARCH_FAILED',
          errmsg:
            error.message ||
            'An unexpected error occurred while searching form submissions',
          successmessage: null,
        },
        responseCode:
          error instanceof BadRequestException
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null,
      };
    }
  }

  async findOne(submissionId: string) {
    try {
      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        return {
          id: 'api.form.submission.get',
          ver: '1.0',
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: 'failed',
            err: 'INVALID_SUBMISSION_ID',
            errmsg: 'Invalid submission ID format. Expected a valid UUID.',
            successmessage: null,
          },
          responseCode: HttpStatus.BAD_REQUEST,
          result: null,
        };
      }

      // Find the form submission
      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        return {
          id: 'api.form.submission.get',
          ver: '1.0',
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: 'failed',
            err: 'SUBMISSION_NOT_FOUND',
            errmsg: `Form submission ID ${submissionId} not found`,
            successmessage: null,
          },
          responseCode: HttpStatus.NOT_FOUND,
          result: null,
        };
      }

      // Get field values using the existing FieldsService
      const customFields = await this.fieldsService.getFieldsAndFieldsValues(
        submission.itemId,
        submission.formId // Pass formId for checkbox processing
      );

      // Create response object
      return {
        id: 'api.form.submission.get',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Form submission details retrieved successfully',
        },
        responseCode: HttpStatus.OK,
        result: {
          formSubmission: {
            submissionId: submission.submissionId,
            formId: submission.formId,
            itemId: submission.itemId,
            status: submission.status,
            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt,
            createdBy: submission.createdBy,
            updatedBy: submission.updatedBy,
            completionPercentage: submission.completionPercentage,
          },
          customFields,
        },
      };
    } catch (error) {
      return {
        id: 'api.form.submission.get',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'failed',
          err: 'FETCH_FAILED',
          errmsg:
            error.message ||
            'An unexpected error occurred while fetching the form submission',
          successmessage: null,
        },
        responseCode:
          error instanceof BadRequestException
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null,
      };
    }
  }

  private async updateFieldValues(
    fieldValue: any,
    userId: string,
    existingFieldValue: any
  ) {
    try {
      let result;
      if (existingFieldValue) {
        result = await this.fieldsService.updateFieldValues(
          existingFieldValue.fieldValuesId,
          new FieldValuesDto({
            fieldId: fieldValue.fieldId,
            value: fieldValue.value,
            itemId: userId,
            updatedBy: userId,
            createdBy: existingFieldValue.createdBy,
          })
        );
      } else {
        result = await this.fieldsService.createFieldValues(
          null,
          new FieldValuesDto({
            fieldId: fieldValue.fieldId,
            value: fieldValue.value,
            itemId: userId,
            createdBy: userId,
            updatedBy: userId,
          })
        );
        if (result instanceof ErrorResponseTypeOrm) {
          return null;
        }
        result = result.data;
      }

      // Get the field metadata
      const field = await this.fieldsService.getFieldById(fieldValue.fieldId);
      if (!field) {
        return null;
      }

      // Return consistent format with field metadata
      return {
        fieldValuesId: result.fieldValuesId || result.data?.fieldValuesId,
        fieldId: field.fieldId,
        fieldname: field.name,
        label: field.label,
        type: field.type.toLowerCase(),
        value: result.value || result.data?.value,
        context: field.context,
        state: field.state,
        contextType: field.contextType,
        fieldParams: field.fieldParams || {},
      };
    } catch (error) {
      console.error('Error in updateFieldValues:', error);
      return null;
    }
  }

  async update(
    submissionId: string,
    updateFormSubmissionDto: UpdateFormSubmissionDto,
    tenantId: string,
    response: Response
  ) {
    try {
      // Get user ID from token
      const decoded: any = jwt_decode(response.req.headers.authorization);
      const userId = decoded?.sub;

      if (!userId) {
        throw new BadRequestException('User ID not found in token');
      }

      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        throw new BadRequestException(
          'Invalid submission ID format. Expected a valid UUID.'
        );
      }

      // Find the existing submission
      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        throw new BadRequestException(
          `Form submission ID ${submissionId} not found`
        );
      }

      // Update form submission if provided
      let updatedSubmission = submission;
      if (updateFormSubmissionDto.formSubmission) {
        try {
          if (updateFormSubmissionDto.formSubmission.formId) {
            submission.formId = updateFormSubmissionDto.formSubmission.formId;
          }
          submission.itemId = userId;
          if (updateFormSubmissionDto.formSubmission.status) {
            submission.status = updateFormSubmissionDto.formSubmission.status;
          }
          // Add completionPercentage if provided
          if (
            updateFormSubmissionDto.formSubmission.completionPercentage !==
            undefined
          ) {
            submission.completionPercentage =
              updateFormSubmissionDto.formSubmission.completionPercentage;
          }
          submission.updatedBy = userId;
          updatedSubmission = await this.formSubmissionRepository.save(
            submission
          );
        } catch (error) {
          LoggerUtil.warn(`Failed to update form submission details`, error);
        }
      }

      // Update field values if provided
      let updatedFieldValues = [];
      if (updateFormSubmissionDto.customFields?.length > 0) {
        try {
          const fieldValuePromises = updateFormSubmissionDto.customFields.map(
            async (fieldValue) => {
              try {
                const existingValue = await this.fieldValuesRepository
                  .createQueryBuilder('fieldValue')
                  .where('fieldValue.fieldId = :fieldId', {
                    fieldId: fieldValue.fieldId,
                  })
                  .andWhere('fieldValue.itemId = :itemId', { itemId: userId })
                  .getOne();

                const result = await this.updateFieldValues(
                  fieldValue,
                  userId,
                  existingValue
                );
                return result;
              } catch (error) {
                console.error('Error updating field value:', error);
                return null;
              }
            }
          );

          const results = await Promise.all(fieldValuePromises);
          updatedFieldValues = results.filter((result) => result !== null);

          // Ensure all field value updates are committed to database before proceeding
          // This prevents race conditions where getFieldsAndFieldsValues might fetch stale data
          await this.fieldValuesRepository.query('SELECT 1'); // Force a database round trip to ensure commits
        } catch (error) {
          LoggerUtil.warn(`Failed to update field values`, error);
        }
      }
      // Get the complete field values with field information (includes dependencies)
      // This call now happens AFTER all field updates are committed
      const completeFieldValues =
        await this.fieldsService.getFieldsAndFieldsValues(
          userId,
          updatedSubmission.formId // Pass formId for checkbox processing
        );

      // Update Elasticsearch after successful form submission update
      // Only update if Elasticsearch is enabled
      if (isElasticsearchEnabled()) {
        await this.updateApplicationInElasticsearch(
          userId,
          updatedSubmission,
          completeFieldValues // Fixed: now passes all fields from DB
        );
      }
      const successResponse = {
        id: 'api.form.submission.update',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Form updated successfully',
        },
        responseCode: HttpStatus.OK,
        result: {
          formSubmission: updatedSubmission,
          customFields: completeFieldValues,
        },
      };

      return response.status(HttpStatus.OK).json(successResponse);
    } catch (error) {
      const errorResponse = {
        id: 'api.form.submission.update',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'failed',
          err:
            error instanceof BadRequestException
              ? 'BAD_REQUEST'
              : 'INTERNAL_SERVER_ERROR',
          errmsg:
            error.message ||
            'An unexpected error occurred while updating the form submission',
          successmessage: null,
        },
        responseCode:
          error instanceof BadRequestException
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null,
      };

      return response.status(errorResponse.responseCode).json(errorResponse);
    }
  }

  async remove(submissionId: string, mode: 'soft' | 'hard' = 'soft') {
    try {
      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        return {
          id: 'api.form.submission.delete',
          ver: '1.0',
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: 'failed',
            err: 'INVALID_SUBMISSION_ID',
            errmsg: 'Invalid submission ID format. Expected a valid UUID.',
            successmessage: null,
          },
          responseCode: HttpStatus.BAD_REQUEST,
          result: null,
        };
      }

      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        return {
          id: 'api.form.submission.delete',
          ver: '1.0',
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: 'failed',
            err: 'SUBMISSION_NOT_FOUND',
            errmsg: `Form submission ID ${submissionId} not found`,
            successmessage: null,
          },
          responseCode: HttpStatus.NOT_FOUND,
          result: null,
        };
      }

      let result;
      if (mode === 'hard') {
        // Permanent delete
        result = await this.formSubmissionRepository.remove(submission);
      } else {
        // Soft delete - update status to ARCHIVED
        submission.status = FormSubmissionStatus.ARCHIVED;
        result = await this.formSubmissionRepository.save(submission);
      }

      return {
        id: 'api.form.submission.delete',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage:
            mode === 'hard'
              ? 'Form submission permanently deleted'
              : 'Form submission archived',
        },
        responseCode: HttpStatus.OK,
        result: {
          submissionId: result.submissionId,
          status: mode === 'hard' ? 'deleted' : result.status,
        },
      };
    } catch (error) {
      return {
        id: 'api.form.submission.delete',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: 'failed',
          err: 'DELETE_FAILED',
          errmsg:
            error.message ||
            'An unexpected error occurred while deleting the form submission',
          successmessage: null,
        },
        responseCode:
          error instanceof BadRequestException
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null,
      };
    }
  }

  private createFieldsSearchDto(filters: any): FieldsSearchDto {
    return new FieldsSearchDto({ filters });
  }

  private createFieldValuesSearchDto(filters: any): FieldValuesSearchDto {
    return new FieldValuesSearchDto({ filters });
  }

  /**
   * Update the user's applications array in Elasticsearch after a form submission update.
   * This will upsert (update or create) the user document in Elasticsearch if missing.
   * If the document is missing, it will fetch the user from the database and create it.
   * Uses centralized data fetcher for consistent data structure.
   */
  private async updateApplicationInElasticsearch(
    userId: string,
    updatedSubmission: FormSubmission,
    updatedFieldValues: any[]
  ): Promise<void> {
    try {
      // Use centralized service to get complete user document
      const userDocument = await this.elasticsearchDataFetcherService.fetchUserDocumentForElasticsearch(userId);
      
      if (!userDocument) {
        this.logger.warn(`User document not found for ${userId}, skipping Elasticsearch update`);
        return;
      }

      // Get the existing user document from Elasticsearch
      const userDoc = await this.userElasticsearchService.getUser(userId);

      // Prepare the applications array (existing or new)
      let applications: any[] = [];
      if (userDoc && userDoc._source) {
        const userSource = userDoc._source as IUser;
        applications = userSource.applications || [];
      }

      // Use the actual submissionId and formId from the updatedSubmission
      const formIdToMatch = updatedSubmission.formId;
      const submissionIdToMatch = updatedSubmission.submissionId;

      // --- NEW LOGIC: Use the robust getFieldIdToPageNameMap utility function ---
      let fieldIdToPageName: Record<string, string> = {};
      let fieldIdToFieldName: Record<string, string> = {};
      let formFieldsOnly: any[] = [];
      try {
        const form = await this.formsService.getFormById(formIdToMatch);
        const fieldsObj = form && form.fields ? (form.fields as any) : null;

        // Handle different schema structures
        let schema: any = {};
        if (fieldsObj) {
          // Try different possible schema structures
          if (
            Array.isArray(fieldsObj?.result) &&
            fieldsObj.result[0]?.schema?.properties
          ) {
            // Structure: { result: [{ schema: { properties: {...} } }] }
            schema = fieldsObj.result[0].schema.properties;
          } else if (fieldsObj?.schema?.properties) {
            // Structure: { schema: { properties: {...} } }
            schema = fieldsObj.schema.properties;
          } else if (fieldsObj?.properties) {
            // Structure: { properties: {...} }
            schema = fieldsObj.properties;
          } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
            // Try to find schema in nested structure
            const findSchema = (obj: any): any => {
              if (obj?.schema?.properties) return obj.schema.properties;
              if (obj?.properties) return obj.properties;
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const found = findSchema(item);
                  if (found) return found;
                }
              } else if (typeof obj === 'object') {
                for (const key in obj) {
                  const found = findSchema(obj[key]);
                  if (found) return found;
                }
              }
              return null;
            };
            schema = findSchema(fieldsObj) || {};
          }
        }

        // Use the robust utility function to get field mappings
        fieldIdToPageName = getFieldIdToPageNameMap(schema);

        // Also build fieldIdToFieldName mapping for logging
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
          const fieldProps = (pageSchema as any).properties || {};

          const extractFieldNames = (properties: any) => {
            for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
              const fieldId = (fieldSchema as any).fieldId;
              const fieldTitle = (fieldSchema as any).title || fieldKey;
              if (fieldId) {
                fieldIdToFieldName[fieldId] = fieldTitle;
              }

              // Handle dependencies
              if ((fieldSchema as any).dependencies) {
                const dependencies = (fieldSchema as any).dependencies;
                for (const depSchema of Object.values(dependencies)) {
                  if (!depSchema || typeof depSchema !== 'object') continue;
                  const dep = depSchema as any;
                  if (dep.oneOf)
                    dep.oneOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.allOf)
                    dep.allOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.anyOf)
                    dep.anyOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.properties) extractFieldNames(dep.properties);
                }
              }
            }
          };

          extractFieldNames(fieldProps);

          // Handle page-level dependencies
          const pageDependencies = (pageSchema as any).dependencies || {};
          for (const depSchema of Object.values(pageDependencies)) {
            if (!depSchema || typeof depSchema !== 'object') continue;
            const dep = depSchema as any;
            if (dep.oneOf)
              dep.oneOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.allOf)
              dep.allOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.anyOf)
              dep.anyOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.properties) extractFieldNames(dep.properties);
          }
        }

        for (const [fieldId, pageName] of Object.entries(fieldIdToPageName)) {
          const fieldName = fieldIdToFieldName[fieldId] || fieldId;
        }

        // Filter updatedFieldValues to only include form fields (not custom fields)
        const formFieldIds = new Set<string>();
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const fieldProps = (pageSchema as any).properties || {};

          const extractFormFieldIds = (properties: any) => {
            for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
              const fieldId = (fieldSchema as any).fieldId;
              if (fieldId) {
                formFieldIds.add(fieldId);
              }

              // Handle nested dependencies structure - ensure dependency fields are included
              if ((fieldSchema as any).dependencies) {
                const dependencies = (fieldSchema as any).dependencies;
                // Check if dependencies is an object
                for (const [depKey, depSchema] of Object.entries(
                  dependencies
                )) {
                  if ((depSchema as any).oneOf) {
                    // Handle oneOf dependencies
                    for (const oneOfItem of (depSchema as any).oneOf) {
                      if (oneOfItem.properties) {
                        extractFormFieldIds(oneOfItem.properties);
                      }
                    }
                  } else if ((depSchema as any).properties) {
                    // Handle direct properties dependencies
                    extractFormFieldIds((depSchema as any).properties);
                  }
                }
              }
            }
          };

          extractFormFieldIds(fieldProps);
        }
                // Filter updatedFieldValues to only include form fields
        // TEMPORARY FIX: If a field is not in formFieldIds but exists in fieldIdToPageName, include it
        formFieldsOnly = updatedFieldValues.filter((field) => {
          const isInFormFieldIds = formFieldIds.has(field.fieldId);
          const isInFieldMapping = fieldIdToPageName[field.fieldId];
          
          return isInFormFieldIds || isInFieldMapping;
        });
      } catch (err) {
        const logger = new Logger('FormSubmissionService');
        logger.error('Schema fetch failed, cannot proceed', err);
        // If schema fetch fails, fallback to empty map (all fields go to 'default')
        fieldIdToPageName = {};
        fieldIdToFieldName = {};
        // If schema fetch fails, don't filter fields (use all updatedFieldValues)
        formFieldsOnly = updatedFieldValues;
      }
      // --- END NEW LOGIC ---

      // Always fetch cohortId from the related Form entity
      // Fetch cohortId from the related Form entity with proper error handling
      let cohortId = '';
      try {
        const form = await this.formsService.getFormById(formIdToMatch);
        cohortId = form?.contextId || '';
      } catch (error) {
        LoggerUtil.warn(
          `Failed to fetch cohortId for formId ${formIdToMatch}:`,
          error
        );
        cohortId = '';
      }
      let existingAppIndex = -1;
      if (cohortId) {
        existingAppIndex = applications.findIndex(
          (app) => app.cohortId === cohortId
        );
        // If not found by cohortId, don't fallback to avoid inconsistencies
        // Log this scenario for investigation
        if (existingAppIndex === -1) {
        }
      } else {
        // Use formId/submissionId only when cohortId is not available
        existingAppIndex = applications.findIndex(
          (app) =>
            app.formId === formIdToMatch &&
            app.submissionId === submissionIdToMatch
        );
      }

      // Prepare the updated fields data using the robust mapping
      const updatedFields = {};
      formFieldsOnly.forEach((field) => {
        const pageKey = fieldIdToPageName[field.fieldId];
        if (!pageKey) {
          // Log warning for unmapped fields instead of fallback
          LoggerUtil.warn(
            `FieldId ${field.fieldId} not found in schema mapping! Skipping field.`
          );
          return; // Skip this field instead of assigning to wrong page
        }
        updatedFields[pageKey] ??= {
          completed: true,
          fields: {},
        };
        // Process field value for Elasticsearch - convert arrays to comma-separated strings
        updatedFields[pageKey].fields[field.fieldId] = this.processFieldValueForElasticsearch(field.value);
      });



      if (existingAppIndex !== -1) {
        // COMPLETELY REPLACE old pages structure instead of merging
        const mergedPages = {};

        // Only use the new schema-based mapping, don't merge with old data
        for (const [pageKey, pageValue] of Object.entries(updatedFields)) {
          const newPage = pageValue as {
            completed: boolean;
            fields: { [key: string]: any };
          };
          mergedPages[pageKey] = newPage;
        }

        // Merge overall progress
        const mergedOverall = applications[existingAppIndex]?.progress?.overall
          ? { ...applications[existingAppIndex].progress.overall }
          : {
              completed: updatedFieldValues.length,
              total: updatedFieldValues.length,
            };

        // Use completionPercentage from the updatedSubmission (payload value) instead of calculating
        const completionPercentage =
          updatedSubmission.completionPercentage ?? 0;

        // --- Update cohortmemberstatus and cohortDetails logic ---
        // cohortmemberstatus is not a property of FormSubmission; set as empty string or fetch from CohortMembers if needed
        applications[existingAppIndex].cohortmemberstatus =
          applications[existingAppIndex].cohortmemberstatus ?? ''; // preserve if already set
        // Ensure cohortDetails is populated; if missing or empty, fetch from DB
        if (
          !applications[existingAppIndex].cohortDetails ||
          Object.keys(applications[existingAppIndex].cohortDetails).length === 0
        ) {
          applications[existingAppIndex].cohortDetails =
            await this.fetchCohortDetailsFromDB(updatedSubmission);
        }
        // --- End cohortmemberstatus and cohortDetails logic ---

        applications[existingAppIndex] = {
          ...applications[existingAppIndex],
          formId: formIdToMatch,
          submissionId: submissionIdToMatch,
          formstatus:
            updatedSubmission.status ??
            applications[existingAppIndex].formstatus,
          // Use completionPercentage from payload (updatedSubmission)
          completionPercentage: completionPercentage,
          progress: {
            pages: mergedPages,
            overall: mergedOverall,
          },
          lastSavedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
        };

        // Also update the FormSubmission entity in the database
        try {
          const submissionToUpdate =
            await this.formSubmissionRepository.findOne({
              where: { submissionId: submissionIdToMatch },
            });
          if (submissionToUpdate) {
            submissionToUpdate.completionPercentage = completionPercentage;
            await this.formSubmissionRepository.save(submissionToUpdate);
          }
        } catch (error) {
          LoggerUtil.warn(
            'Failed to update FormSubmission completionPercentage:',
            error
          );
        }
      } else {
        // If no existing application found, build from DB with correct cohortDetails
        const newApp = await this.buildApplicationFromDB(updatedSubmission);
        applications.push(newApp);
      }

      // Upsert (update or create) the user document in Elasticsearch
      if (isElasticsearchEnabled()) {
        await this.userElasticsearchService.updateUser(
          userId,
          { doc: { applications: applications } },
          async (userId: string) => {
            // Build the full user document for Elasticsearch, including profile and all applications
            return await this.buildUserDocumentForElasticsearch(userId);
          }
        );
      }
    } catch (elasticError) {
      // Log Elasticsearch error but don't fail the request
      LoggerUtil.warn('Failed to update Elasticsearch:', elasticError);
    }
  }

  /**
   * Helper to fetch cohort details from the database for a given submission.
   * Returns an object with cohort details as required by the application schema.
   * Fetches cohortId from the related Form entity.
   */
  private async fetchCohortDetailsFromDB(
    submission: FormSubmission
  ): Promise<any> {
    try {
      // Get cohortId from the related Form
      const form = await this.formsService.getFormById(submission.formId);
      const cohortId = form?.contextId || '';
      if (!cohortId) return { name: '', status: '' };

      // Use the same approach as cohort members service for consistency
      // Get basic cohort information directly from database
      const cohort = await this.cohortRepository.findOne({
        where: { cohortId: cohortId },
        select: ['cohortId', 'name', 'parentId', 'type', 'status'],
      });

      if (cohort) {
        // Get cohort custom fields using the same method as cohort members service
        const cohortCustomFields =
          await this.postgresCohortService.getCohortCustomFieldDetails(
            cohortId
          );

        return {
          cohortId: cohort.cohortId,
          name: cohort.name,
          parentId: cohort.parentId,
          type: cohort.type,
          status: cohort.status,
          customFields: cohortCustomFields,
        };
      }
    } catch (e) {
      LoggerUtil.warn('Failed to fetch cohort details:', e);
    }
    return { name: '', status: '' };
  }

  /**
   * Helper to build a full application object from the database, including cohortDetails and progress.
   * Used when the application does not exist in Elasticsearch.
   * Fetches cohortId from the related Form entity.
   * cohortmemberstatus is set as an empty string (add logic to fetch from CohortMembers if needed).
   */
  private async buildApplicationFromDB(
    submission: FormSubmission
  ): Promise<any> {
    let progress: any = {};
    let formData: any = {};
    let cohortId = '';
    let formIdToMatch = submission.formId;
    let submissionIdToMatch = submission.submissionId;

    try {
      // Get form schema to understand field structure
      let schema: any = {};
      try {
        const form = await this.formsService.getFormById(submission.formId);
        const fieldsObj = form && form.fields ? (form.fields as any) : null;

        // Get cohortId from form context
        cohortId = form?.contextId || '';

        // Handle different schema structures
        if (fieldsObj) {
          // Try different possible schema structures
          if (
            Array.isArray(fieldsObj?.result) &&
            fieldsObj.result[0]?.schema?.properties
          ) {
            // Structure: { result: [{ schema: { properties: {...} } }] }
            schema = fieldsObj.result[0].schema.properties;
          } else if (fieldsObj?.schema?.properties) {
            // Structure: { schema: { properties: {...} } }
            schema = fieldsObj.schema.properties;
          } else if (fieldsObj?.properties) {
            // Structure: { properties: {...} }
            schema = fieldsObj.properties;
          } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
            // Try to find schema in nested structure
            const findSchema = (obj: any): any => {
              if (obj?.schema?.properties) return obj.schema.properties;
              if (obj?.properties) return obj.properties;
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const found = findSchema(item);
                  if (found) return found;
                }
              } else if (typeof obj === 'object') {
                for (const key in obj) {
                  const found = findSchema(obj[key]);
                  if (found) return found;
                }
              }
              return null;
            };
            schema = findSchema(fieldsObj) || {};
          }
        }
      } catch (e) {
        schema = {};
      }

      const updatedFieldValues =
        await this.fieldsService.getFieldsAndFieldsValues(submission.itemId);

      // Filter updatedFieldValues to only include form fields (not custom fields)
      // Get all field IDs that are part of the current form schema
      const formFieldIds = new Set<string>();
      const fieldIdToPageName: Record<string, string> = {};
      const fieldIdToSchemaFieldName: Record<string, string> = {};

      // Debug: Log the schema structure to understand the dependencies
      LoggerUtil.warn(
        `Schema structure (buildApplicationFromDB): ${JSON.stringify(
          schema,
          null,
          2
        )}`
      );

      for (const [pageKey, pageSchema] of Object.entries(schema)) {
        LoggerUtil.warn(`Processing page: ${pageKey}`);
        const fieldProps = (pageSchema as any).properties || {};
        LoggerUtil.warn(
          `Page properties: ${JSON.stringify(Object.keys(fieldProps))}`
        );

        const extractFormFieldIds = (properties: any) => {
          for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
            const fieldId = (fieldSchema as any).fieldId;
            if (fieldId) {
              formFieldIds.add(fieldId);
              LoggerUtil.warn(
                `Found fieldId: ${fieldId} in ${fieldKey} (buildApplicationFromDB)`
              );
            }

            // Handle nested dependencies structure - ensure dependency fields are included
            if ((fieldSchema as any).dependencies) {
              LoggerUtil.warn(
                `Found dependencies for field: ${fieldKey} (buildApplicationFromDB)`
              );
              const dependencies = (fieldSchema as any).dependencies;
              LoggerUtil.warn(
                `Dependencies object: ${JSON.stringify(
                  Object.keys(dependencies)
                )}`
              );
              for (const [depKey, depSchema] of Object.entries(dependencies)) {
                LoggerUtil.warn(
                  `Processing dependency: ${depKey} (buildApplicationFromDB)`
                );
                LoggerUtil.warn(
                  `Dependency schema: ${JSON.stringify(depSchema)}`
                );
                if ((depSchema as any).oneOf) {
                  // Handle oneOf dependencies
                  LoggerUtil.warn(
                    `Found oneOf dependency in ${depKey} (buildApplicationFromDB)`
                  );
                  LoggerUtil.warn(
                    `OneOf items count: ${(depSchema as any).oneOf.length}`
                  );
                  for (const oneOfItem of (depSchema as any).oneOf) {
                    LoggerUtil.warn(`OneOf item: ${JSON.stringify(oneOfItem)}`);
                    if (oneOfItem.properties) {
                      LoggerUtil.warn(
                        `Extracting from oneOf properties: ${JSON.stringify(
                          oneOfItem.properties
                        )} (buildApplicationFromDB)`
                      );
                      extractFormFieldIds(oneOfItem.properties);
                    }
                  }
                } else if ((depSchema as any).properties) {
                  // Handle direct properties dependencies
                  LoggerUtil.warn(
                    `Extracting from direct properties: ${JSON.stringify(
                      (depSchema as any).properties
                    )} (buildApplicationFromDB)`
                  );
                  extractFormFieldIds((depSchema as any).properties);
                }
              }
            }
          }
        };

        // Use the robust utility function to get field mappings
        const fieldMappings = getFieldIdToPageNameMap(schema);
        Object.assign(fieldIdToPageName, fieldMappings);

        // Also build fieldIdToSchemaFieldName mapping
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
          const fieldProps = (pageSchema as any).properties || {};

          const extractFieldNames = (properties: any) => {
            for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
              const fieldId = (fieldSchema as any).fieldId;
              const fieldTitle = (fieldSchema as any).title || fieldKey;
              if (fieldId) {
                fieldIdToSchemaFieldName[fieldId] = fieldTitle;
              }

              // Handle dependencies
              if ((fieldSchema as any).dependencies) {
                const dependencies = (fieldSchema as any).dependencies;
                for (const depSchema of Object.values(dependencies)) {
                  if (!depSchema || typeof depSchema !== 'object') continue;
                  const dep = depSchema as any;
                  if (dep.oneOf)
                    dep.oneOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.allOf)
                    dep.allOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.anyOf)
                    dep.anyOf.forEach(
                      (item: any) =>
                        item?.properties && extractFieldNames(item.properties)
                    );
                  if (dep.properties) extractFieldNames(dep.properties);
                }
              }
            }
          };

          extractFieldNames(fieldProps);

          // Handle page-level dependencies
          const pageDependencies = (pageSchema as any).dependencies || {};
          for (const depSchema of Object.values(pageDependencies)) {
            if (!depSchema || typeof depSchema !== 'object') continue;
            const dep = depSchema as any;
            if (dep.oneOf)
              dep.oneOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.allOf)
              dep.allOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.anyOf)
              dep.anyOf.forEach(
                (item: any) =>
                  item?.properties && extractFieldNames(item.properties)
              );
            if (dep.properties) extractFieldNames(dep.properties);
          }
        }

        extractFormFieldIds(fieldProps);

        // Extract dependency fields from page-level dependencies
        const pageDependencies = (pageSchema as any).dependencies || {};
        LoggerUtil.warn(
          `Page dependencies: ${JSON.stringify(
            Object.keys(pageDependencies)
          )} (buildApplicationFromDB)`
        );

        for (const [depKey, depSchema] of Object.entries(pageDependencies)) {
          LoggerUtil.warn(
            `Processing page dependency: ${depKey} (buildApplicationFromDB)`
          );

          // Handle oneOf dependencies
          if ((depSchema as any).oneOf) {
            LoggerUtil.warn(
              `Found oneOf in page dependency: ${depKey} (buildApplicationFromDB)`
            );
            for (const oneOfItem of (depSchema as any).oneOf) {
              if (oneOfItem.properties) {
                LoggerUtil.warn(
                  `Processing oneOf properties for page dependency ${depKey} (buildApplicationFromDB)`
                );
                // Extract field IDs from dependency properties
                for (const [propKey, propSchema] of Object.entries(
                  oneOfItem.properties
                )) {
                  const propFieldId = (propSchema as any).fieldId;
                  if (propFieldId) {
                    formFieldIds.add(propFieldId);
                    LoggerUtil.warn(
                      `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildApplicationFromDB)`
                    );
                  }
                }
              }
            }
          }

          // Handle direct properties in page dependencies
          if ((depSchema as any).properties) {
            LoggerUtil.warn(
              `Processing direct properties in page dependency: ${depKey} (buildApplicationFromDB)`
            );
            // Extract field IDs from dependency properties
            for (const [propKey, propSchema] of Object.entries(
              (depSchema as any).properties
            )) {
              const propFieldId = (propSchema as any).fieldId;
              if (propFieldId) {
                formFieldIds.add(propFieldId);
                LoggerUtil.warn(
                  `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildApplicationFromDB)`
                );
              }
            }
          }
        }
      }

      // Temporary check for dependency field
      if (formFieldIds.has('1b92932d-648b-4b26-9f12-f43cec5416ef')) {
        LoggerUtil.warn(
          ' Dependency field fieldsOfStudy found in formFieldIds'
        );
      } else {
        LoggerUtil.warn(
          'Dependency field fieldsOfStudy NOT found in formFieldIds'
        );
      }

      // Filter updatedFieldValues to only include form fields
      const formFieldsOnly = updatedFieldValues.filter((field) =>
        formFieldIds.has(field.fieldId)
      );

      const pages: Record<string, any> = {};
      formData = {};

      // Now build pages using the mappings
      for (const [pageKey, pageSchema] of Object.entries(schema)) {
        const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
        pages[pageName] = { completed: true, fields: {} };
        formData[pageName] = {};
      }

      // Map field values to correct pages using the schema mappings
      for (const field of formFieldsOnly) {
        const pageName = fieldIdToPageName[field.fieldId];
        if (!pageName) {
          // Log warning for unmapped fields instead of fallback
          LoggerUtil.warn(
            `FieldId ${field.fieldId} not found in schema mapping! Skipping field.`
          );
          continue; // Skip this field instead of assigning to wrong page
        }
        const fieldName =
          fieldIdToSchemaFieldName[field.fieldId] ||
          field.fieldname ||
          field.fieldId;

        if (!pages[pageName]) {
          pages[pageName] = { completed: true, fields: {} };
          formData[pageName] = {};
        }

        // Process field value for Elasticsearch - convert arrays to comma-separated strings
        pages[pageName].fields[field.fieldId] = this.processFieldValueForElasticsearch(field.value);
        formData[pageName][field.fieldId] = this.processFieldValueForElasticsearch(field.value);
      }

      if (Object.keys(pages).length === 0) {
        pages['eligibilityCheck'] = {
          completed: true,
          fields: formFieldsOnly.reduce((acc, field) => {
            // Process field value for Elasticsearch - convert arrays to comma-separated strings
            acc[field.fieldId] = this.processFieldValueForElasticsearch(field.value);
            return acc;
          }, {}),
        };
        formData['eligibilityCheck'] = {
          ...pages['eligibilityCheck'].fields,
        };
      }

      progress = {
        pages,
        overall: {
          completed: formFieldsOnly.length,
          total: formFieldsOnly.length,
        },
      };
    } catch (error) {
      LoggerUtil.warn('Error building application from DB:', error);
      // Fallback to basic structure
      progress = {
        pages: {
          eligibilityCheck: {
            completed: true,
            fields: {},
          },
        },
        overall: {
          completed: 0,
          total: 0,
        },
      };
      formData = {};
    }

    // Get detailed cohortDetails using the same method as fetchCohortDetailsFromDB
    let detailedCohortDetails: any = {
      name: '',
      status: '',
    };

    if (cohortId) {
      try {
        // Get basic cohort information directly from database
        const cohortDetails = await this.cohortRepository.findOne({
          where: { cohortId: cohortId },
          select: ['cohortId', 'name', 'parentId', 'type', 'status'],
        });

        if (cohortDetails) {
          // Get cohort custom fields using the same method as cohort members service
          const cohortCustomFields =
            await this.postgresCohortService.getCohortCustomFieldDetails(
              cohortId
            );

          detailedCohortDetails = {
            cohortId: cohortDetails.cohortId,
            name: cohortDetails.name,
            parentId: cohortDetails.parentId,
            type: cohortDetails.type,
            status: cohortDetails.status,
            // Removed customFields from cohortDetails as per requirement
          };
        }
      } catch (error) {
        LoggerUtil.warn('Error fetching cohort details:', error);
      }
    }

    return {
      cohortId,
      formId: formIdToMatch,
      submissionId: submissionIdToMatch,
      cohortmemberstatus: submission.status || 'active',
      formstatus: submission.status || 'active',
      completionPercentage: submission.completionPercentage || 0,
      progress,
      formData,
      lastSavedAt:
        submission.updatedAt?.toISOString() || new Date().toISOString(),
      submittedAt:
        submission.createdAt?.toISOString() || new Date().toISOString(),
      cohortDetails: detailedCohortDetails,
    };
  }

  /**
   * Helper to build the full user document for Elasticsearch upsert, including profile and all applications.
   * This version fetches the form schema for each application and maps fields to the correct page and field name.
   * Only user profile custom fields go in profile.customFields.
   *
   * Made public so it can be used as an upsert callback from other services (e.g., cohortMembers-adapter).
   */
  /**
   * Build user document for Elasticsearch using centralized data fetcher.
   * This method provides a centralized way to fetch user data for Elasticsearch.
   * 
   * @param userId - User ID to fetch data for
   * @returns Promise<IUser | null> - Complete user document or null if user not found
   */
  public async buildUserDocumentForElasticsearch(
    userId: string
  ): Promise<IUser | null> {
    // Use centralized data fetcher service for consistent data structure
    return await this.elasticsearchDataFetcherService.fetchUserDocumentForElasticsearch(userId);
  }

  /**
   * Legacy method - kept for backward compatibility.
   * @deprecated Use buildUserDocumentForElasticsearch instead
   */
  public async buildUserDocumentForElasticsearchLegacy(
    userId: string
  ): Promise<IUser | null> {
    // Fetch user profile from Users table
    const userRepo = this.formRepository.manager.getRepository('Users');
    const user = await userRepo.findOne({ where: { userId } });
    if (!user) return null;
    // Fetch profile custom fields (these are not form submission fields)
    let profileCustomFields = await this.fieldsService.getFieldsAndFieldsValues(
      userId
    );

    // Fetch all cohort memberships for this user
    const cohortMemberships = await this.cohortMembersRepository.find({
      where: { userId },
    });
    // Fetch all form submissions for this user
    const submissions = await this.formSubmissionRepository.find({
      where: { itemId: userId },
    });

    // Remove custom fields that are part of any form schema for this user
    // Only include custom fields in profile that are NOT part of any form schema (i.e., not used in any form for this user)
    const allFormFieldIds = new Set<string>();
    for (const submission of submissions) {
      try {
        const form = await this.formsService.getFormById(submission.formId);
        const fieldsObj = form && form.fields ? (form.fields as any) : null;

        // Handle different schema structures
        if (fieldsObj) {
          // Try different possible schema structures
          if (
            Array.isArray(fieldsObj?.result) &&
            fieldsObj.result[0]?.schema?.properties
          ) {
            // Structure: { result: [{ schema: { properties: {...} } }] }
            const schema = fieldsObj.result[0].schema.properties;
            for (const pageSchema of Object.values(schema)) {
              const fieldProps = (pageSchema as any).properties || {};
              for (const fieldSchema of Object.values(fieldProps)) {
                const fieldId = (fieldSchema as any).fieldId;
                if (fieldId) allFormFieldIds.add(fieldId);

                // Handle nested dependencies structure - ensure dependency fields are included
                if ((fieldSchema as any).dependencies) {
                  const dependencies = (fieldSchema as any).dependencies;
                  for (const [depKey, depSchema] of Object.entries(
                    dependencies
                  )) {
                    if ((depSchema as any).oneOf) {
                      // Handle oneOf dependencies
                      for (const oneOfItem of (depSchema as any).oneOf) {
                        if (oneOfItem.properties) {
                          for (const depFieldSchema of Object.values(
                            oneOfItem.properties
                          )) {
                            const depFieldId = (depFieldSchema as any).fieldId;
                            if (depFieldId) allFormFieldIds.add(depFieldId);
                          }
                        }
                      }
                    } else if ((depSchema as any).properties) {
                      // Handle direct properties dependencies
                      for (const depFieldSchema of Object.values(
                        (depSchema as any).properties
                      )) {
                        const depFieldId = (depFieldSchema as any).fieldId;
                        if (depFieldId) allFormFieldIds.add(depFieldId);
                      }
                    }
                  }
                }
              }
            }
          } else if (fieldsObj?.schema?.properties) {
            // Structure: { schema: { properties: {...} } }
            const schema = fieldsObj.schema.properties;
            for (const pageSchema of Object.values(schema)) {
              const fieldProps = (pageSchema as any).properties || {};
              for (const fieldSchema of Object.values(fieldProps)) {
                const fieldId = (fieldSchema as any).fieldId;
                if (fieldId) allFormFieldIds.add(fieldId);

                // Handle nested dependencies structure - ensure dependency fields are included
                if ((fieldSchema as any).dependencies) {
                  const dependencies = (fieldSchema as any).dependencies;
                  for (const [depKey, depSchema] of Object.entries(
                    dependencies
                  )) {
                    if ((depSchema as any).oneOf) {
                      // Handle oneOf dependencies
                      for (const oneOfItem of (depSchema as any).oneOf) {
                        if (oneOfItem.properties) {
                          for (const depFieldSchema of Object.values(
                            oneOfItem.properties
                          )) {
                            const depFieldId = (depFieldSchema as any).fieldId;
                            if (depFieldId) allFormFieldIds.add(depFieldId);
                          }
                        }
                      }
                    } else if ((depSchema as any).properties) {
                      // Handle direct properties dependencies
                      for (const depFieldSchema of Object.values(
                        (depSchema as any).properties
                      )) {
                        const depFieldId = (depFieldSchema as any).fieldId;
                        if (depFieldId) allFormFieldIds.add(depFieldId);
                      }
                    }
                  }
                }
              }
            }
          } else if (fieldsObj?.properties) {
            // Structure: { properties: {...} }
            const schema = fieldsObj.properties;
            for (const pageSchema of Object.values(schema)) {
              const fieldProps = (pageSchema as any).properties || {};
              for (const fieldSchema of Object.values(fieldProps)) {
                const fieldId = (fieldSchema as any).fieldId;
                if (fieldId) allFormFieldIds.add(fieldId);

                // Handle nested dependencies structure - ensure dependency fields are included
                if ((fieldSchema as any).dependencies) {
                  const dependencies = (fieldSchema as any).dependencies;
                  for (const [depKey, depSchema] of Object.entries(
                    dependencies
                  )) {
                    if ((depSchema as any).oneOf) {
                      // Handle oneOf dependencies
                      for (const oneOfItem of (depSchema as any).oneOf) {
                        if (oneOfItem.properties) {
                          for (const depFieldSchema of Object.values(
                            oneOfItem.properties
                          )) {
                            const depFieldId = (depFieldSchema as any).fieldId;
                            if (depFieldId) allFormFieldIds.add(depFieldId);
                          }
                        }
                      }
                    } else if ((depSchema as any).properties) {
                      // Handle direct properties dependencies
                      for (const depFieldSchema of Object.values(
                        (depSchema as any).properties
                      )) {
                        const depFieldId = (depFieldSchema as any).fieldId;
                        if (depFieldId) allFormFieldIds.add(depFieldId);
                      }
                    }
                  }
                }
              }
            }
          } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
            // Try to find schema in nested structure
            const findSchema = (obj: any): any => {
              if (obj?.schema?.properties) return obj.schema.properties;
              if (obj?.properties) return obj.properties;
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const found = findSchema(item);
                  if (found) return found;
                }
              } else if (typeof obj === 'object') {
                for (const key in obj) {
                  const found = findSchema(obj[key]);
                  if (found) return found;
                }
              }
              return null;
            };
            const schema = findSchema(fieldsObj);
            if (schema) {
              for (const pageSchema of Object.values(schema)) {
                const fieldProps = (pageSchema as any).properties || {};
                for (const fieldSchema of Object.values(fieldProps)) {
                  const fieldId = (fieldSchema as any).fieldId;
                  if (fieldId) allFormFieldIds.add(fieldId);

                  // Handle nested dependencies structure - ensure dependency fields are included
                  if ((fieldSchema as any).dependencies) {
                    const dependencies = (fieldSchema as any).dependencies;
                    for (const [depKey, depSchema] of Object.entries(
                      dependencies
                    )) {
                      if ((depSchema as any).oneOf) {
                        // Handle oneOf dependencies
                        for (const oneOfItem of (depSchema as any).oneOf) {
                          if (oneOfItem.properties) {
                            for (const depFieldSchema of Object.values(
                              oneOfItem.properties
                            )) {
                              const depFieldId = (depFieldSchema as any)
                                .fieldId;
                              if (depFieldId) allFormFieldIds.add(depFieldId);
                            }
                          }
                        }
                      } else if ((depSchema as any).properties) {
                        // Handle direct properties dependencies
                        for (const depFieldSchema of Object.values(
                          (depSchema as any).properties
                        )) {
                          const depFieldId = (depFieldSchema as any).fieldId;
                          if (depFieldId) allFormFieldIds.add(depFieldId);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {}
    }

    // Filter out form-related fields from profile custom fields
    profileCustomFields = profileCustomFields.filter(
      (f) => !allFormFieldIds.has(f.fieldId)
    );

    // Build maps for fast lookup
    const membershipMap = new Map();
    for (const m of cohortMemberships) membershipMap.set(m.cohortId, m);
    const submissionMap = new Map();
    for (const s of submissions) {
      let cohortId = '';
      try {
        const form = await this.formsService.getFormById(s.formId);
        cohortId = form?.contextId || '';
      } catch {}
      if (cohortId) submissionMap.set(cohortId, s);
    }
    // Union of all cohortIds
    const allCohortIds = new Set([
      ...membershipMap.keys(),
      ...submissionMap.keys(),
    ]);
    const applications = [];
    for (const cohortId of allCohortIds) {
      const membership = membershipMap.get(cohortId);
      const submission = submissionMap.get(cohortId);
      // Fetch cohort details
      const cohort = await this.cohortRepository.findOne({
        where: { cohortId },
      });
      // Prepare application fields
      let formId = '',
        submissionId = '',
        status = '',
        formstatus = '',
        progress = { pages: {}, overall: { completed: 0, total: 0 } },
        lastSavedAt = null,
        submittedAt = null,
        formData = {};
      if (submission) {
        formId = submission.formId;
        submissionId = submission.submissionId;
        status = submission.status;
        formstatus = submission.status;
        lastSavedAt = submission.updatedAt
          ? submission.updatedAt.toISOString()
          : new Date().toISOString();
        submittedAt = submission.createdAt
          ? submission.createdAt.toISOString()
          : new Date().toISOString();
        // Build progress/pages as before
        let schema: any = {};
        try {
          const form = await this.formsService.getFormById(submission.formId);
          const fieldsObj = form && form.fields ? (form.fields as any) : null;

          // Handle different schema structures
          if (fieldsObj) {
            // Try different possible schema structures
            if (
              Array.isArray(fieldsObj?.result) &&
              fieldsObj.result[0]?.schema?.properties
            ) {
              // Structure: { result: [{ schema: { properties: {...} } }] }
              schema = fieldsObj.result[0].schema.properties;
            } else if (fieldsObj?.schema?.properties) {
              // Structure: { schema: { properties: {...} } }
              schema = fieldsObj.schema.properties;
            } else if (fieldsObj?.properties) {
              // Structure: { properties: {...} }
              schema = fieldsObj.properties;
            } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
              // Try to find schema in nested structure
              const findSchema = (obj: any): any => {
                if (obj?.schema?.properties) return obj.schema.properties;
                if (obj?.properties) return obj.properties;
                if (Array.isArray(obj)) {
                  for (const item of obj) {
                    const found = findSchema(item);
                    if (found) return found;
                  }
                } else if (typeof obj === 'object') {
                  for (const key in obj) {
                    const found = findSchema(obj[key]);
                    if (found) return found;
                  }
                }
                return null;
              };
              schema = findSchema(fieldsObj) || {};
            }
          }
        } catch (e) {
          schema = {};
        }
        const submissionCustomFields =
          await this.fieldsService.getFieldsAndFieldsValues(submission.itemId);

        // Filter submissionCustomFields to only include form fields (not custom fields)
        // Get all field IDs that are part of the current form schema
        const formFieldIds = new Set<string>();

        // Debug: Log the schema structure to understand the dependencies
        LoggerUtil.warn(`Schema structure: ${JSON.stringify(schema, null, 2)}`);

        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          LoggerUtil.warn(`Processing page: ${pageKey} (buildUserDocument)`);
          const fieldProps = (pageSchema as any).properties || {};
          LoggerUtil.warn(
            `Page properties: ${JSON.stringify(
              Object.keys(fieldProps)
            )} (buildUserDocument)`
          );

          const extractFormFieldIds = (properties: any) => {
            for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
              const fieldId = (fieldSchema as any).fieldId;
              if (fieldId) {
                formFieldIds.add(fieldId);
                LoggerUtil.warn(
                  `Found fieldId: ${fieldId} in ${fieldKey} (buildUserDocument)`
                );
              }

              // Handle nested dependencies structure - ensure dependency fields are included
              if ((fieldSchema as any).dependencies) {
                LoggerUtil.warn(
                  `Found dependencies for field: ${fieldKey} (buildUserDocument)`
                );
                const dependencies = (fieldSchema as any).dependencies;
                LoggerUtil.warn(
                  `Dependencies object: ${JSON.stringify(
                    Object.keys(dependencies)
                  )} (buildUserDocument)`
                );
                for (const [depKey, depSchema] of Object.entries(
                  dependencies
                )) {
                  LoggerUtil.warn(
                    `Processing dependency: ${depKey} (buildUserDocument)`
                  );
                  LoggerUtil.warn(
                    `Dependency schema: ${JSON.stringify(
                      depSchema
                    )} (buildUserDocument)`
                  );
                  if ((depSchema as any).oneOf) {
                    // Handle oneOf dependencies
                    LoggerUtil.warn(
                      `Found oneOf dependency in ${depKey} (buildUserDocument)`
                    );
                    LoggerUtil.warn(
                      `OneOf items count: ${
                        (depSchema as any).oneOf.length
                      } (buildUserDocument)`
                    );
                    for (const oneOfItem of (depSchema as any).oneOf) {
                      LoggerUtil.warn(
                        `OneOf item: ${JSON.stringify(
                          oneOfItem
                        )} (buildUserDocument)`
                      );
                      if (oneOfItem.properties) {
                        LoggerUtil.warn(
                          `Extracting from oneOf properties: ${JSON.stringify(
                            oneOfItem.properties
                          )} (buildUserDocument)`
                        );
                        extractFormFieldIds(oneOfItem.properties);
                      }
                    }
                  } else if ((depSchema as any).properties) {
                    // Handle direct properties dependencies
                    LoggerUtil.warn(
                      `Extracting from direct properties: ${JSON.stringify(
                        (depSchema as any).properties
                      )} (buildUserDocument)`
                    );
                    extractFormFieldIds((depSchema as any).properties);
                  }
                }
              }
            }
          };

          extractFormFieldIds(fieldProps);
        }

        // Extract dependency fields from page-level dependencies
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageDependencies = (pageSchema as any).dependencies || {};
          LoggerUtil.warn(
            `Page dependencies: ${JSON.stringify(
              Object.keys(pageDependencies)
            )} (buildUserDocument)`
          );

          for (const [depKey, depSchema] of Object.entries(pageDependencies)) {
            LoggerUtil.warn(
              `Processing page dependency: ${depKey} (buildUserDocument)`
            );

            // Handle oneOf dependencies
            if ((depSchema as any).oneOf) {
              LoggerUtil.warn(
                `Found oneOf in page dependency: ${depKey} (buildUserDocument)`
              );
              for (const oneOfItem of (depSchema as any).oneOf) {
                if (oneOfItem.properties) {
                  LoggerUtil.warn(
                    `Processing oneOf properties for page dependency ${depKey} (buildUserDocument)`
                  );
                  // Map dependency fields to the current page
                  // extractFieldMappings(oneOfItem.properties, pageKey); // REMOVED - out of scope
                  for (const [propKey, propSchema] of Object.entries(
                    oneOfItem.properties
                  )) {
                    const propFieldId = (propSchema as any).fieldId;
                    if (propFieldId) {
                      formFieldIds.add(propFieldId);
                      LoggerUtil.warn(
                        `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildUserDocument)`
                      );
                    }
                  }
                }
              }
            }

            // Handle direct properties in page dependencies
            if ((depSchema as any).properties) {
              LoggerUtil.warn(
                `Processing direct properties in page dependency: ${depKey} (buildUserDocument)`
              );
              // Map dependency fields to the current page
              // extractFieldMappings((depSchema as any).properties, pageKey); // REMOVED - out of scope
              for (const [propKey, propSchema] of Object.entries(
                (depSchema as any).properties
              )) {
                const propFieldId = (propSchema as any).fieldId;
                if (propFieldId) {
                  formFieldIds.add(propFieldId);
                  LoggerUtil.warn(
                    `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildUserDocument)`
                  );
                }
              }
            }
          }
        }

        LoggerUtil.warn(
          `Schema field IDs including dependencies: ${Array.from(
            formFieldIds
          ).join(', ')}`
        );

        // Temporary check for dependency field
        if (formFieldIds.has('1b92932d-648b-4b26-9f12-f43cec5416ef')) {
          LoggerUtil.warn(
            'Dependency field fieldsOfStudy found in formFieldIds (buildUserDocument)'
          );
        } else {
          LoggerUtil.warn(
            'Dependency field fieldsOfStudy NOT found in formFieldIds (buildUserDocument)'
          );
        }

        // Filter updatedFieldValues to only include form fields
        const formFieldsOnly = submissionCustomFields.filter((field) =>
          formFieldIds.has(field.fieldId)
        );

        const fieldIdToValue: Record<string, any> = {};
        const fieldIdToFieldName: Record<string, string> = {};
        for (const field of formFieldsOnly) {
          fieldIdToValue[field.fieldId] = field.value;
          fieldIdToFieldName[field.fieldId] = field.fieldname || field.fieldId;
        }
        const pages: Record<string, any> = {};
        formData = {};

        // Build fieldId to pageName and fieldName mappings from schema
        const fieldIdToPageName: Record<string, string> = {};
        const fieldIdToSchemaFieldName: Record<string, string> = {};

        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
          const fieldProps = (pageSchema as any).properties || {};

          // Use the robust utility function to get field mappings
          const fieldMappings = getFieldIdToPageNameMap(schema);
          Object.assign(fieldIdToPageName, fieldMappings);

          // Also build fieldIdToSchemaFieldName mapping
          for (const [pageKey, pageSchema] of Object.entries(schema)) {
            const pageName =
              pageKey === 'default' ? 'eligibilityCheck' : pageKey;
            const fieldProps = (pageSchema as any).properties || {};

            const extractFieldNames = (properties: any) => {
              for (const [fieldKey, fieldSchema] of Object.entries(
                properties
              )) {
                const fieldId = (fieldSchema as any).fieldId;
                const fieldTitle = (fieldSchema as any).title || fieldKey;
                if (fieldId) {
                  fieldIdToSchemaFieldName[fieldId] = fieldTitle;
                }

                // Handle dependencies
                if ((fieldSchema as any).dependencies) {
                  const dependencies = (fieldSchema as any).dependencies;
                  for (const depSchema of Object.values(dependencies)) {
                    if (!depSchema || typeof depSchema !== 'object') continue;
                    const dep = depSchema as any;
                    if (dep.oneOf)
                      dep.oneOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.allOf)
                      dep.allOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.anyOf)
                      dep.anyOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.properties) extractFieldNames(dep.properties);
                  }
                }
              }
            };

            extractFieldNames(fieldProps);

            // Handle page-level dependencies
            const pageDependencies = (pageSchema as any).dependencies || {};
            for (const depSchema of Object.values(pageDependencies)) {
              if (!depSchema || typeof depSchema !== 'object') continue;
              const dep = depSchema as any;
              if (dep.oneOf)
                dep.oneOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.allOf)
                dep.allOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.anyOf)
                dep.anyOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.properties) extractFieldNames(dep.properties);
            }
          }
        }

        // Log final mappings for verification

        for (const [fieldId, pageName] of Object.entries(fieldIdToPageName)) {
          const fieldName = fieldIdToSchemaFieldName[fieldId] || fieldId;
        }

        // Now build pages using the mappings
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
          pages[pageName] = { completed: true, fields: {} };
          formData[pageName] = {};
        }

        // Map field values to correct pages using the schema mappings
        for (const field of formFieldsOnly) {
          const pageName = fieldIdToPageName[field.fieldId];
          if (!pageName) {
            // Log warning for unmapped fields instead of fallback
            LoggerUtil.warn(
              `FieldId ${field.fieldId} not found in schema mapping! Skipping field.`
            );
            continue; // Skip this field instead of assigning to wrong page
          }
          const fieldName =
            fieldIdToSchemaFieldName[field.fieldId] ||
            field.fieldname ||
            field.fieldId;

          if (!pages[pageName]) {
            pages[pageName] = { completed: true, fields: {} };
            formData[pageName] = {};
          }

          // Process field value for Elasticsearch - convert arrays to comma-separated strings
          pages[pageName].fields[field.fieldId] = this.processFieldValueForElasticsearch(field.value);
          formData[pageName][field.fieldId] = this.processFieldValueForElasticsearch(field.value);
        }
        if (Object.keys(pages).length === 0) {
          pages['eligibilityCheck'] = {
            completed: true,
            fields: formFieldsOnly.reduce((acc, field) => {
              // Process field value for Elasticsearch - convert arrays to comma-separated strings
              acc[field.fieldId] = this.processFieldValueForElasticsearch(field.value);
              return acc;
            }, {}),
          };
          formData['eligibilityCheck'] = {
            ...pages['eligibilityCheck'].fields,
          };
        }
        progress = {
          pages,
          overall: {
            completed: formFieldsOnly.length,
            total: formFieldsOnly.length,
          },
        };
      }
      // Get detailed cohortDetails using the same method as fetchCohortDetailsFromDB
      let detailedCohortDetails: any = {
        name: cohort?.name ?? '',
        status: cohort?.status ?? '',
      };
      if (cohortId) {
        try {
          // Get basic cohort information directly from database
          const cohortDetails = await this.cohortRepository.findOne({
            where: { cohortId: cohortId },
            select: ['cohortId', 'name', 'parentId', 'type', 'status'],
          });

          if (cohortDetails) {
            // Get cohort custom fields using the same method as cohort members service
            const cohortCustomFields =
              await this.postgresCohortService.getCohortCustomFieldDetails(
                cohortId
              );

            detailedCohortDetails = {
              cohortId: cohortDetails.cohortId,
              name: cohortDetails.name,
              parentId: cohortDetails.parentId,
              type: cohortDetails.type,
              status: cohortDetails.status,
              customFields: cohortCustomFields,
            };
          }
        } catch (e) {
          LoggerUtil.warn('Failed to fetch detailed cohort details:', e);
        }
      }

      applications.push({
        formId,
        submissionId,
        cohortId,
        status,
        cohortmemberstatus: membership?.status || '',
        formstatus,
        // FIXED: Add completionPercentage from form submission
        completionPercentage: submission?.completionPercentage ?? 0,
        progress,
        lastSavedAt,
        submittedAt,
        cohortDetails: detailedCohortDetails as any,
        formData,
      });
    }
    // Also, for any form submission that is not linked to a cohortId (contextId), add as a separate application
    for (const submission of submissions) {
      let cohortId = '';
      try {
        const form = await this.formsService.getFormById(submission.formId);
        cohortId = form?.contextId || '';
      } catch {}
      if (!cohortId) {
        // orphan submission
        let schema: any = {};
        try {
          const form = await this.formsService.getFormById(submission.formId);
          const fieldsObj = form && form.fields ? (form.fields as any) : null;

          // Handle different schema structures
          if (fieldsObj) {
            // Try different possible schema structures
            if (
              Array.isArray(fieldsObj?.result) &&
              fieldsObj.result[0]?.schema?.properties
            ) {
              // Structure: { result: [{ schema: { properties: {...} } }] }
              schema = fieldsObj.result[0].schema.properties;
            } else if (fieldsObj?.schema?.properties) {
              // Structure: { schema: { properties: {...} } }
              schema = fieldsObj.schema.properties;
            } else if (fieldsObj?.properties) {
              // Structure: { properties: {...} }
              schema = fieldsObj.properties;
            } else if (typeof fieldsObj === 'object' && fieldsObj !== null) {
              // Try to find schema in nested structure
              const findSchema = (obj: any): any => {
                if (obj?.schema?.properties) return obj.schema.properties;
                if (obj?.properties) return obj.properties;
                if (Array.isArray(obj)) {
                  for (const item of obj) {
                    const found = findSchema(item);
                    if (found) return found;
                  }
                } else if (typeof obj === 'object') {
                  for (const key in obj) {
                    const found = findSchema(obj[key]);
                    if (found) return found;
                  }
                }
                return null;
              };
              schema = findSchema(fieldsObj) || {};
            }
          }
        } catch (e) {
          schema = {};
        }
        const submissionCustomFields =
          await this.fieldsService.getFieldsAndFieldsValues(submission.itemId);

        // Filter submissionCustomFields to only include form fields (not custom fields)
        // Get all field IDs that are part of the current form schema
        const formFieldIds = new Set<string>();

        // Debug: Log the schema structure to understand the dependencies
        LoggerUtil.warn(`Schema structure: ${JSON.stringify(schema, null, 2)}`);

        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          LoggerUtil.warn(`Processing page: ${pageKey} (buildUserDocument)`);
          const fieldProps = (pageSchema as any).properties || {};
          LoggerUtil.warn(
            `Page properties: ${JSON.stringify(
              Object.keys(fieldProps)
            )} (buildUserDocument)`
          );

          const extractFormFieldIds = (properties: any) => {
            for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
              const fieldId = (fieldSchema as any).fieldId;
              if (fieldId) {
                formFieldIds.add(fieldId);
                LoggerUtil.warn(
                  `Found fieldId: ${fieldId} in ${fieldKey} (buildUserDocument)`
                );
              }

              // Handle nested dependencies structure - ensure dependency fields are included
              if ((fieldSchema as any).dependencies) {
                LoggerUtil.warn(
                  `Found dependencies for field: ${fieldKey} (buildUserDocument)`
                );
                const dependencies = (fieldSchema as any).dependencies;
                LoggerUtil.warn(
                  `Dependencies object: ${JSON.stringify(
                    Object.keys(dependencies)
                  )} (buildUserDocument)`
                );
                for (const [depKey, depSchema] of Object.entries(
                  dependencies
                )) {
                  LoggerUtil.warn(
                    `Processing dependency: ${depKey} (buildUserDocument)`
                  );
                  LoggerUtil.warn(
                    `Dependency schema: ${JSON.stringify(
                      depSchema
                    )} (buildUserDocument)`
                  );
                  if ((depSchema as any).oneOf) {
                    // Handle oneOf dependencies
                    LoggerUtil.warn(
                      `Found oneOf dependency in ${depKey} (buildUserDocument)`
                    );
                    LoggerUtil.warn(
                      `OneOf items count: ${
                        (depSchema as any).oneOf.length
                      } (buildUserDocument)`
                    );
                    for (const oneOfItem of (depSchema as any).oneOf) {
                      LoggerUtil.warn(
                        `OneOf item: ${JSON.stringify(
                          oneOfItem
                        )} (buildUserDocument)`
                      );
                      if (oneOfItem.properties) {
                        LoggerUtil.warn(
                          `Extracting from oneOf properties: ${JSON.stringify(
                            oneOfItem.properties
                          )} (buildUserDocument)`
                        );
                        extractFormFieldIds(oneOfItem.properties);
                      }
                    }
                  } else if ((depSchema as any).properties) {
                    // Handle direct properties dependencies
                    LoggerUtil.warn(
                      `Extracting from direct properties: ${JSON.stringify(
                        (depSchema as any).properties
                      )} (buildUserDocument)`
                    );
                    extractFormFieldIds((depSchema as any).properties);
                  }
                }
              }
            }
          };

          extractFormFieldIds(fieldProps);
        }

        // Extract dependency fields from page-level dependencies
        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageDependencies = (pageSchema as any).dependencies || {};
          LoggerUtil.warn(
            `Page dependencies: ${JSON.stringify(
              Object.keys(pageDependencies)
            )} (buildUserDocument)`
          );

          for (const [depKey, depSchema] of Object.entries(pageDependencies)) {
            LoggerUtil.warn(
              `Processing page dependency: ${depKey} (buildUserDocument)`
            );

            // Handle oneOf dependencies
            if ((depSchema as any).oneOf) {
              LoggerUtil.warn(
                `Found oneOf in page dependency: ${depKey} (buildUserDocument)`
              );
              for (const oneOfItem of (depSchema as any).oneOf) {
                if (oneOfItem.properties) {
                  LoggerUtil.warn(
                    `Processing oneOf properties for page dependency ${depKey} (buildUserDocument)`
                  );
                  // Map dependency fields to the current page
                  // extractFieldMappings(oneOfItem.properties, pageKey); // REMOVED - out of scope
                  for (const [propKey, propSchema] of Object.entries(
                    oneOfItem.properties
                  )) {
                    const propFieldId = (propSchema as any).fieldId;
                    if (propFieldId) {
                      formFieldIds.add(propFieldId);
                      LoggerUtil.warn(
                        `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildUserDocument)`
                      );
                    }
                  }
                }
              }
            }

            // Handle direct properties in page dependencies
            if ((depSchema as any).properties) {
              LoggerUtil.warn(
                `Processing direct properties in page dependency: ${depKey} (buildUserDocument)`
              );
              // Map dependency fields to the current page
              // extractFieldMappings((depSchema as any).properties, pageKey); // REMOVED - out of scope
              for (const [propKey, propSchema] of Object.entries(
                (depSchema as any).properties
              )) {
                const propFieldId = (propSchema as any).fieldId;
                if (propFieldId) {
                  formFieldIds.add(propFieldId);
                  LoggerUtil.warn(
                    `Found page dependency fieldId: ${propFieldId} in ${propKey} (buildUserDocument)`
                  );
                }
              }
            }
          }
        }

        LoggerUtil.warn(
          `Schema field IDs including dependencies: ${Array.from(
            formFieldIds
          ).join(', ')}`
        );

        // Temporary check for dependency field
        if (formFieldIds.has('1b92932d-648b-4b26-9f12-f43cec5416ef')) {
          LoggerUtil.warn(
            'Dependency field fieldsOfStudy found in formFieldIds (buildUserDocument)'
          );
        } else {
          LoggerUtil.warn(
            'Dependency field fieldsOfStudy NOT found in formFieldIds (buildUserDocument)'
          );
        }

        // Filter updatedFieldValues to only include form fields
        const formFieldsOnly = submissionCustomFields.filter((field) =>
          formFieldIds.has(field.fieldId)
        );

        const fieldIdToValue: Record<string, any> = {};
        const fieldIdToFieldName: Record<string, string> = {};
        for (const field of formFieldsOnly) {
          fieldIdToValue[field.fieldId] = field.value;
          fieldIdToFieldName[field.fieldId] = field.fieldname || field.fieldId;
        }
        const pages: Record<string, any> = {};
        const formData: Record<string, any> = {};

        // Build fieldId to pageName and fieldName mappings from schema
        const fieldIdToPageName: Record<string, string> = {};
        const fieldIdToSchemaFieldName: Record<string, string> = {};

        for (const [pageKey, pageSchema] of Object.entries(schema)) {
          const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
          const fieldProps = (pageSchema as any).properties || {};

          // Use the robust utility function to get field mappings
          const fieldMappings = getFieldIdToPageNameMap(schema);
          Object.assign(fieldIdToPageName, fieldMappings);

          // Also build fieldIdToSchemaFieldName mapping
          for (const [pageKey, pageSchema] of Object.entries(schema)) {
            const pageName =
              pageKey === 'default' ? 'eligibilityCheck' : pageKey;
            const fieldProps = (pageSchema as any).properties || {};

            const extractFieldNames = (properties: any) => {
              for (const [fieldKey, fieldSchema] of Object.entries(
                properties
              )) {
                const fieldId = (fieldSchema as any).fieldId;
                const fieldTitle = (fieldSchema as any).title || fieldKey;
                if (fieldId) {
                  fieldIdToSchemaFieldName[fieldId] = fieldTitle;
                }

                // Handle dependencies
                if ((fieldSchema as any).dependencies) {
                  const dependencies = (fieldSchema as any).dependencies;
                  for (const depSchema of Object.values(dependencies)) {
                    if (!depSchema || typeof depSchema !== 'object') continue;
                    const dep = depSchema as any;
                    if (dep.oneOf)
                      dep.oneOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.allOf)
                      dep.allOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.anyOf)
                      dep.anyOf.forEach(
                        (item: any) =>
                          item?.properties && extractFieldNames(item.properties)
                      );
                    if (dep.properties) extractFieldNames(dep.properties);
                  }
                }
              }
            };

            extractFieldNames(fieldProps);

            // Handle page-level dependencies
            const pageDependencies = (pageSchema as any).dependencies || {};
            for (const depSchema of Object.values(pageDependencies)) {
              if (!depSchema || typeof depSchema !== 'object') continue;
              const dep = depSchema as any;
              if (dep.oneOf)
                dep.oneOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.allOf)
                dep.allOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.anyOf)
                dep.anyOf.forEach(
                  (item: any) =>
                    item?.properties && extractFieldNames(item.properties)
                );
              if (dep.properties) extractFieldNames(dep.properties);
            }
          }
        }
      }
    }
    // Build the IUser object
    return {
      userId: user.userId,
      profile: {
        userId: user.userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName || '',
        email: user.email || '',
        mobile: user.mobile ? user.mobile.toString() : '',
        mobile_country_code: user.mobile_country_code || '',
        gender: user.gender,
        dob: user.dob instanceof Date ? user.dob.toISOString() : user.dob || '',
        country: user.country,
        address: user.address || '',
        district: user.district || '',
        state: user.state || '',
        pincode: user.pincode || '',
        status: user.status,
        customFields: profileCustomFields, // Only user profile custom fields
      },
      applications,
      courses: [],
      createdAt: user.createdAt
        ? user.createdAt.toISOString()
        : new Date().toISOString(),
      updatedAt: user.updatedAt
        ? user.updatedAt.toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Helper function to process field values for Elasticsearch storage.
   * Converts array values to comma-separated strings for multiselect fields.
   * @param value - The field value to process
   * @returns Processed value (array becomes comma-separated string, other types unchanged)
   */
  private processFieldValueForElasticsearch(value: any): any {
    // If value is an array, convert to comma-separated string
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    // Return value as-is for non-array values
    return value;
  }
}

/**
 * Recursively extract a mapping from fieldId to pageName for all fields in the schema,
 * including all nested dependencies (oneOf, allOf, anyOf, properties).
 */
function getFieldIdToPageNameMap(schema: any): Record<string, string> {
  const fieldIdToPageName: Record<string, string> = {};

  function extract(properties: any, currentPage: string) {
    if (!properties || typeof properties !== 'object') return;
    for (const [fieldKey, fieldSchema] of Object.entries(properties)) {
      if (!fieldSchema || typeof fieldSchema !== 'object') continue;
      const fieldId = (fieldSchema as any).fieldId;
      if (fieldId) fieldIdToPageName[fieldId] = currentPage;

      // Traverse dependencies
      if ((fieldSchema as any).dependencies) {
        for (const depSchema of Object.values(
          (fieldSchema as any).dependencies
        )) {
          if (!depSchema || typeof depSchema !== 'object') continue;
          const dep = depSchema as any;
          if (dep.oneOf)
            dep.oneOf.forEach(
              (item: any) =>
                item?.properties && extract(item.properties, currentPage)
            );
          if (dep.allOf)
            dep.allOf.forEach(
              (item: any) =>
                item?.properties && extract(item.properties, currentPage)
            );
          if (dep.anyOf)
            dep.anyOf.forEach(
              (item: any) =>
                item?.properties && extract(item.properties, currentPage)
            );
          if (dep.properties) extract(dep.properties, currentPage);
        }
      }
    }
  }

  for (const [pageKey, pageSchema] of Object.entries(schema)) {
    const pageName = pageKey === 'default' ? 'eligibilityCheck' : pageKey;
    extract((pageSchema as any).properties, pageName);

    // Also check for page-level dependencies
    if ((pageSchema as any).dependencies) {
      for (const depSchema of Object.values((pageSchema as any).dependencies)) {
        if (!depSchema || typeof depSchema !== 'object') continue;
        const dep = depSchema as any;
        if (dep.oneOf)
          dep.oneOf.forEach(
            (item: any) =>
              item?.properties && extract(item.properties, pageName)
          );
        if (dep.allOf)
          dep.allOf.forEach(
            (item: any) =>
              item?.properties && extract(item.properties, pageName)
          );
        if (dep.anyOf)
          dep.anyOf.forEach(
            (item: any) =>
              item?.properties && extract(item.properties, pageName)
          );
        if (dep.properties) extract(dep.properties, pageName);
      }
    }
  }

  return fieldIdToPageName;
}
