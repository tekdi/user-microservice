import {
  Injectable,
  HttpStatus,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, In } from 'typeorm';
import {
  FormSubmission,
  FormSubmissionStatus,
} from '../entities/form-submission.entity';
import {
  CreateFormSubmissionDto,
  FieldValueDto,
} from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { FieldValues } from '../../fields/entities/fields-values.entity';
import { Fields, FieldType } from '../../fields/entities/fields.entity';
import { FieldValueConverter } from '../../utils/field-value-converter';
import APIResponse from '../../common/responses/response';
import { Response } from 'express';
import { APIID } from '../../common/utils/api-id.config';
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
import { IApplication } from '../../elasticsearch/interfaces/user.interface';
import { FormsService } from '../../forms/forms.service';
import { PostgresCohortService } from 'src/adapters/postgres/cohort-adapter';
import { IUser } from '../../elasticsearch/interfaces/user.interface';

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
  constructor(
    @InjectRepository(FormSubmission)
    private formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(Form)
    private formRepository: Repository<Form>,
    private fieldsService: FieldsService,
    private userElasticsearchService: UserElasticsearchService,
    private formsService: FormsService,
    @Inject(forwardRef(() => PostgresCohortService))
    private postgresCohortService: PostgresCohortService
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
        savedSubmission.itemId
      );

      // Get form details first to get contextId
      const formDetails = await this.formsService.getFormById(
        createFormSubmissionDto.formSubmission.formId
      );
      if (!formDetails) {
        throw new BadRequestException('Form not found');
      }

      // Get form data using contextId
      const formData = await this.formsService.getFormData({
        context: 'COHORTMEMBER',
        contextType: 'COHORTMEMBER',
        contextId: formDetails.contextId,
        tenantId: createFormSubmissionDto.tenantId,
      });

      if (!formData) {
        throw new BadRequestException('Form data not found');
      }

      const cohortId = formData.contextId;

      // Extract schema from formData
      interface SchemaProperty {
        fieldId: string;
        type?: string;
        [key: string]: any;
      }

      interface PageSchema {
        properties: {
          [key: string]: SchemaProperty;
        };
        [key: string]: any;
      }

      const schema = (formData.fields?.result?.[0]?.schema?.properties ||
        {}) as {
        [key: string]: PageSchema;
      };

      const mockResponse = {
        status: (code: number) => ({
          json: (data: any) => data,
        }),
      };

      const cohortDetails = await this.postgresCohortService.getCohortsDetails(
        {
          cohortId: formData.contextId,
          getChildData: false,
        },
        mockResponse
      );

      if (!cohortDetails?.result?.cohortData?.[0]) {
        throw new BadRequestException('Cohort details not found');
      }

      const cohortData = cohortDetails.result.cohortData[0];

      // Use cohortData.customField instead of making another database call
      const cohortFieldValues = cohortData.customField || [];

      const application = {
        cohortId: cohortData.cohortId,
        formId: savedSubmission.formId,
        submissionId: savedSubmission.submissionId,
        formstatus:
          createFormSubmissionDto.formSubmission.status ||
          FormSubmissionStatus.ACTIVE,
        progress: {
          pages: {},
          overall: {
            completed: createFormSubmissionDto.customFields.length,
            total: createFormSubmissionDto.customFields.length,
          },
        },
        lastSavedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        cohortDetails: {
          name: cohortData.name || '',
          status: cohortData.status || '',
          // Dynamically map all custom fields using their labels as keys
          ...cohortFieldValues.reduce((acc, field) => {
            acc[field.label] = field.value || '';
            return acc;
          }, {} as Record<string, any>),
        },
        formData: {},
      };

      // Loop through each page from the schema
      for (const [pageKey, pageSchema] of Object.entries(schema)) {
        const pageName = pageKey === 'default' ? 'eligibility' : pageKey;

        // Initialize sections
        application.progress.pages[pageName] = {
          completed: true,
          fields: {},
        };

        application.formData[pageName] = {};

        // Loop through each field defined in the schema
        const fieldProps = pageSchema.properties || {};
        for (const [fieldKey, fieldSchema] of Object.entries(fieldProps)) {
          const fieldId = fieldSchema.fieldId;

          // Find matching submitted field value
          const matchingField = createFormSubmissionDto.customFields.find(
            (f) => f.fieldId === fieldId
          );

          if (matchingField) {
            // Fetch the field name using fieldsService
            let fieldName = fieldId;
            try {
              const fieldDef = await this.fieldsService.getFieldById(fieldId);
              if (fieldDef && fieldDef.name) {
                fieldName = fieldDef.name;
              }
            } catch (e) {}
            const value = matchingField.value;

            // Assign to both progress and formData
            application.progress.pages[pageName].fields[fieldName] = value;
            application.formData[pageName][fieldName] = value;
          }
        }
      }

      await this.userElasticsearchService.updateApplication(
        userId,
        application
      );

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
    return await this.formSubmissionRepository.findAndCount({
      where: whereClause,
      order:
        sort?.length === 2
          ? { [sort[0]]: sort[1].toUpperCase() }
          : { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
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
        };

        if (includeDisplayValues) {
          result.customFields =
            await this.fieldsService.getFieldsAndFieldsValues(
              submission.itemId
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
        submission.itemId
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
          submission.updatedBy = userId;
          updatedSubmission = await this.formSubmissionRepository.save(
            submission
          );
        } catch (error) {
          throw new Error('Failed to update form submission details');
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
        } catch (error) {
          throw new Error('Failed to update field values');
        }
      }
      // Update Elasticsearch after successful form submission update
      try {
        // Get the existing user document from Elasticsearch
        const userDoc = await this.userElasticsearchService.getUser(userId);

        if (!userDoc) {
          throw new Error('User document not found in Elasticsearch');
        }

        // Get existing applications or initialize empty array
        const userSource = userDoc._source as IUser;
        const applications = userSource.applications || [];

        // Use the actual submissionId and formId from the updatedSubmission
        const formIdToMatch = updatedSubmission.formId;
        const submissionIdToMatch = updatedSubmission.submissionId;

        // --- NEW LOGIC: Fetch form schema and build fieldId -> pageName map ---
        let fieldIdToPageName: Record<string, string> = {};
        try {
          const form = await this.formsService.getFormById(formIdToMatch);
          const fieldsObj = form && form.fields ? (form.fields as any) : null;
          if (
            Array.isArray(fieldsObj?.result) &&
            fieldsObj.result[0]?.schema?.properties
          ) {
            const schema = fieldsObj.result[0].schema.properties;
            for (const [pageKey, pageSchema] of Object.entries(schema)) {
              const pageName = pageKey === 'default' ? 'eligibility' : pageKey;
              const fieldProps = (pageSchema as any).properties ?? {};
              for (const [fieldSchema] of Object.entries(fieldProps)) {
                const fieldId = (fieldSchema as any).fieldId;
                if (fieldId) {
                  fieldIdToPageName[fieldId] = pageName;
                }
              }
            }
          }
        } catch (err) {
          const logger = new Logger('YourMethodNameOrClass');
          logger.error('Schema fetch failed, cannot proceed', err);
          // If schema fetch fails, fallback to empty map (all fields go to 'default')
          fieldIdToPageName = {};
        }
        // --- END NEW LOGIC ---

        // Find the existing application for this form and submission
        const existingAppIndex = applications.findIndex(
          (app) =>
            app.formId === formIdToMatch &&
            app.submissionId === submissionIdToMatch
        );

        // Prepare the updated fields data
        const updatedFields = {};
        updatedFieldValues.forEach((field) => {
          // Use the schema mapping to get the correct page name
          const pageKey = fieldIdToPageName[field.fieldId] || 'default';

          updatedFields[pageKey] ??= {
            completed: true,
            fields: {},
          };
          updatedFields[pageKey].fields[field.fieldname ?? field.fieldId] =
            field.value;
        });

        if (existingAppIndex !== -1) {
          // Deep merge for each page's fields
          const mergedPages = {
            ...(applications[existingAppIndex]?.progress?.pages || {}),
          };
          for (const [pageKey, pageValue] of Object.entries(updatedFields)) {
            const newPage = pageValue as {
              completed: boolean;
              fields: { [key: string]: any };
            };
            if (mergedPages[pageKey]) {
              const existingPage = mergedPages[pageKey] as {
                completed: boolean;
                fields: { [key: string]: any };
              };
              mergedPages[pageKey] = {
                ...existingPage,
                fields: {
                  ...existingPage.fields,
                  ...newPage.fields,
                },
                completed: newPage.completed, // update completed status if needed
              };
            } else {
              mergedPages[pageKey] = newPage;
            }
          }
          // Merge overall progress
          const mergedOverall = applications[existingAppIndex]?.progress
            ?.overall
            ? { ...applications[existingAppIndex].progress.overall }
            : {
                completed: updatedFieldValues.length,
                total: updatedFieldValues.length,
              };

          applications[existingAppIndex] = {
            ...applications[existingAppIndex],
            formId: formIdToMatch,
            submissionId: submissionIdToMatch,
            formstatus:
              updatedSubmission.status ??
              applications[existingAppIndex].formstatus,
            progress: {
              pages: mergedPages,
              overall: mergedOverall,
            },
            lastSavedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString(),
          };
        } else {
          // If no existing application found, create new application with minimal required fields
          applications.push({
            formId: formIdToMatch,
            submissionId: submissionIdToMatch,
            cohortId: '',
            status: '',
            cohortmemberstatus: '',
            formstatus: updatedSubmission.status,
            progress: {
              pages: updatedFields,
              overall: {
                completed: updatedFieldValues.length,
                total: updatedFieldValues.length,
              },
            },
            lastSavedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            cohortDetails: {
              name: '',
              status: '',
            },
          });
        }

        // Update the Elasticsearch document with the modified applications array
        await this.userElasticsearchService.updateUser(userId, {
          doc: {
            applications: applications,
          },
        });
      } catch (elasticError) {
        // Log Elasticsearch error but don't fail the request
        console.error('Failed to update Elasticsearch:', elasticError);
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
          customFields: updatedFieldValues,
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
}
