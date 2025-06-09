import { Injectable, HttpStatus, BadRequestException } from '@nestjs/common';
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
import { FieldValueConverter } from '../../utils/field-value-converter';
import { Fields, FieldType } from '../../fields/entities/fields.entity';
import APIResponse from '../../common/responses/response';
import { Response } from 'express';
import { APIID } from '../../common/utils/api-id.config';
import { API_RESPONSES } from '../../common/utils/response.messages';
import { FieldsService } from '../../fields/fields.service';
import { FieldValuesDto } from '../../fields/dto/field-values.dto';
import { ErrorResponseTypeOrm } from '../../error-response-typeorm';
import { SuccessResponse } from '../../common/responses/success.response';
import { PostgresCohortMembersService } from '../../adapters/postgres/cohortMembers-adapter';
import { CohortMembersDto } from '../../cohortMembers/dto/cohortMembers.dto';
import { MemberStatus } from '../../cohortMembers/entities/cohort-member.entity';
import { isUUID } from 'class-validator';
import { FormSubmissionSearchDto } from '../dto/form-submission-search.dto';
import { FieldValuesSearchDto } from '../../fields/dto/field-values-search.dto';
import { FieldsSearchDto } from '../../fields/dto/fields-search.dto';
import { CohortMembersUpdateDto } from '../../cohortMembers/dto/cohortMember-update.dto';
import jwt_decode from 'jwt-decode';

@Injectable()
export class FormSubmissionService {
  constructor(
    @InjectRepository(FormSubmission)
    private formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    private fieldsService: FieldsService,
    private cohortMembersService: PostgresCohortMembersService
  ) {}

  async create(
    createFormSubmissionDto: CreateFormSubmissionDto,
    response: Response,
    cohortAcademicYearId: string
  ) {
    try {
      // Get user ID from token
      const decoded: any = jwt_decode(response.req.headers.authorization);
      const userId = decoded?.sub;

      if (!userId) {
        throw new BadRequestException('User ID not found in token');
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

      console.log('Creating form submission with data:', {
        formId: formSubmission.formId,
        itemId: formSubmission.itemId,
        status: formSubmission.status,
        createdBy: formSubmission.createdBy
      });

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

      // Handle cohort member creation/update if cohortMember data is present
      let cohortMemberResult = null;
      if (createFormSubmissionDto.cohortMember) {
        try {
          console.log('Starting cohort member creation with data:', {
            userId: savedSubmission.itemId,
            cohortId: createFormSubmissionDto.cohortMember.cohortId,
            cohortAcademicYearId,
            status: createFormSubmissionDto.cohortMember.status,
            tenantId: createFormSubmissionDto.tenantId
          });

          if (!cohortAcademicYearId) {
            throw new BadRequestException('cohortAcademicYearId is required for cohort member creation');
          }

          if (!createFormSubmissionDto.tenantId) {
            throw new BadRequestException('tenantId is required for cohort member creation');
          }

          const tempResponse = {
            status: function (code) { 
              console.log('Response status code:', code);
              return this; 
            },
            json: function (data) { 
              console.log('Response data:', data);
              return data; 
            },
          } as Response;

          // Check if cohort member already exists
          console.log('Checking if cohort member exists...');
          const existingMember = await this.cohortMembersService.cohortUserMapping(
            savedSubmission.itemId,
            createFormSubmissionDto.cohortMember.cohortId,
            cohortAcademicYearId
          );

          console.log('Existing member check result:', existingMember);

          if (existingMember) {
            console.log('Updating existing cohort member');
            // Update existing cohort member
            const updateDto = new CohortMembersUpdateDto({
              cohortMembershipId: existingMember.cohortMembershipId,
              cohortId: createFormSubmissionDto.cohortMember.cohortId,
              userId: savedSubmission.itemId,
              status: createFormSubmissionDto.cohortMember.status ? createFormSubmissionDto.cohortMember.status.toLowerCase() : MemberStatus.APPLIED,
              statusReason: createFormSubmissionDto.cohortMember.statusReason || '',
              customFields: createFormSubmissionDto.cohortMember.customFields,
              updatedBy: userId,
              createdBy: existingMember.createdBy,
              createdAt: existingMember.createdAt,
              updatedAt: new Date().toISOString(),
              cohortAcademicYearId: cohortAcademicYearId,
              tenantId: createFormSubmissionDto.tenantId
            });

            console.log('Update DTO:', updateDto);

            const result = await this.cohortMembersService.updateCohortMembers(
              existingMember.cohortMembershipId,
              userId,
              updateDto,
              tempResponse
            );

            console.log('Update result:', result);

            if (result?.responseCode === HttpStatus.OK && result.result) {
              cohortMemberResult = result.result;
            }
          } else {
            console.log('Creating new cohort member');
            // Create new cohort member
            const cohortMemberDto = new CohortMembersDto({
              cohortId: createFormSubmissionDto.cohortMember.cohortId,
              userId: savedSubmission.itemId,
              createdBy: userId,
              updatedBy: userId,
              cohortAcademicYearId: cohortAcademicYearId,
              status: createFormSubmissionDto.cohortMember.status ? createFormSubmissionDto.cohortMember.status.toLowerCase() : MemberStatus.APPLIED,
              statusReason: createFormSubmissionDto.cohortMember.statusReason || '',
              customFields: createFormSubmissionDto.cohortMember.customFields,
              tenantId: createFormSubmissionDto.tenantId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            console.log('Create DTO:', cohortMemberDto);

            const result = await this.cohortMembersService.createCohortMembers(
              userId,
              cohortMemberDto,
              tempResponse,
              createFormSubmissionDto.tenantId,
              'web',
              cohortAcademicYearId
            );

            console.log('Create result:', result);

            if (result?.responseCode === HttpStatus.OK && result.result) {
              cohortMemberResult = result.result;
              console.log('Successfully created cohort member:', cohortMemberResult);
            } else if (result?.responseCode === HttpStatus.CONFLICT) {
              console.log('Got conflict response, checking existing member');
              // If we get a conflict, try to get the existing member details
              const conflictMember = await this.cohortMembersService.cohortUserMapping(
                savedSubmission.itemId,
                createFormSubmissionDto.cohortMember.cohortId,
                cohortAcademicYearId
              );
              
              if (conflictMember) {
                cohortMemberResult = {
                  cohortMembershipId: conflictMember.cohortMembershipId,
                  cohortId: conflictMember.cohortId,
                  userId: conflictMember.userId,
                  status: conflictMember.status,
                  statusReason: conflictMember.statusReason,
                  updatedBy: conflictMember.updatedBy,
                  updatedAt: conflictMember.updatedAt,
                  cohortAcademicYearId: conflictMember.cohortAcademicYearId,
                  customFields: createFormSubmissionDto.cohortMember.customFields
                };
                console.log('Using existing cohort member:', cohortMemberResult);
              }
            } else {
              console.log('Unexpected response from createCohortMembers:', result);
              throw new Error(`Failed to create cohort member. Response code: ${result?.responseCode}`);
            }
          }
        } catch (error) {
          console.error('Detailed error in cohort member creation/update:', error);
          // Instead of silently continuing, we'll throw the error
          throw new BadRequestException(`Failed to create/update cohort member: ${error.message}`);
        }
      }

      // Create response object with form submission as primary focus
      const responseData = {
        id: 'api.form.submission.create',
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: savedSubmission.submissionId,
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: 'Form saved successfully'
        },
        responseCode: HttpStatus.CREATED,
        result: {
          formSubmission: savedSubmission,
          customFields,
          ...(cohortMemberResult && { cohortMember: cohortMemberResult })
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

  async findAll(formSubmissionSearchDto: FormSubmissionSearchDto) {
    try {
      let { limit, offset, filters, sort, includeDisplayValues } =
        formSubmissionSearchDto;

      // Set default values
      offset = offset || 0;
      limit = limit || 10;

      // Get all valid form submission fields for filtering
      const formSubmissionKeys =
        this.formSubmissionRepository.metadata.columns.map(
          (column) => column.propertyName
        );

      // Build where clause
      const whereClause: any = {};
      if (filters && Object.keys(filters).length > 0) {
        Object.entries(filters).forEach(([key, value]) => {
          if (key === 'customFieldsFilter') {
            // Handle custom fields separately
            return;
          }

          if (!formSubmissionKeys.includes(key)) {
            throw new BadRequestException(`Invalid filter key: ${key}`);
          }

          // Handle different types of filters
          if (key === 'status') {
            if (Array.isArray(value)) {
              whereClause[key] = In(
                value.map((status) => status.toLowerCase())
              );
            } else {
              whereClause[key] = value.toLowerCase();
            }
          }
          // Handle UUID fields (exact match)
          else if (
            [
              'submissionId',
              'formId',
              'itemId',
              'createdBy',
              'updatedBy',
            ].includes(key)
          ) {
            if (value && !isUUID(value)) {
              throw new BadRequestException(`Invalid UUID format for ${key}`);
            }
            whereClause[key] = value;
          }
          // Handle date fields
          else if (['createdAt', 'updatedAt'].includes(key)) {
            if (typeof value === 'object' && value.start && value.end) {
              whereClause[key] = Between(
                new Date(value.start),
                new Date(value.end)
              );
            } else if (value) {
              whereClause[key] = new Date(value);
            }
          }
          // Default case
          else {
            whereClause[key] = value;
          }
        });
      }

      // Get form submissions with pagination
      const [submissions, totalCount] =
        await this.formSubmissionRepository.findAndCount({
          where: whereClause,
          order:
            sort?.length === 2
              ? { [sort[0]]: sort[1].toUpperCase() }
              : { createdAt: 'DESC' },
          skip: offset,
          take: limit,
        });

      // Handle custom field filters if any
      let filteredSubmissions = [...submissions];
      let filteredCount = submissions.length;
      if (filters?.customFieldsFilter && Object.keys(filters.customFieldsFilter).length > 0) {
        const customFieldFilters = filters.customFieldsFilter;
        
        // Get all field definitions first to validate field types
        const fieldIds = Object.keys(customFieldFilters);
        const searchDto: FieldsSearchDto = {
          filters: {
            fieldIds
          },
          limit: fieldIds.length,
          offset: 0
        };
        const fieldDefinitionsResult = await this.fieldsService.searchFields('default', { headers: {} }, searchDto);
        let fieldDefinitions: Fields[] = [];
        if (fieldDefinitionsResult instanceof SuccessResponse && 'data' in fieldDefinitionsResult) {
          fieldDefinitions = fieldDefinitionsResult.data as Fields[];
        }

        // Create a map of fieldId to field definition
        const fieldDefinitionMap = new Map(
          fieldDefinitions.map((field: Fields) => [field.fieldId, field])
        );

        // Build query with joins
        const queryBuilder = this.formSubmissionRepository
          .createQueryBuilder('fs')
          .leftJoinAndSelect('field_values', 'fv', 'fv.itemId = fs.itemId')
          .leftJoinAndSelect('fields', 'f', 'f.fieldId = fv.fieldId')
          .where(whereClause);

        // Add conditions for each custom field filter
        Object.entries(customFieldFilters).forEach(([fieldId, expectedValue]) => {
          const fieldDef = fieldDefinitionMap.get(fieldId) as Fields;
          if (!fieldDef) {
            throw new BadRequestException(`Invalid field ID: ${fieldId}`);
          }

          const fieldType = fieldDef.type;
          switch (fieldType) {
            case FieldType.NUMERIC:
              queryBuilder.andWhere('fv.fieldId = :fieldId AND CAST(fv.value AS DECIMAL) = :value', {
                fieldId,
                value: Number(expectedValue)
              });
              break;
            case FieldType.CALENDAR:
              queryBuilder.andWhere('fv.fieldId = :fieldId AND fv.value = :value', {
                fieldId,
                value: new Date(expectedValue).toISOString()
              });
              break;
            case FieldType.CHECKBOX:
              queryBuilder.andWhere('fv.fieldId = :fieldId AND fv.value = :value', {
                fieldId,
                value: Boolean(expectedValue).toString()
              });
              break;
            case FieldType.DROPDOWN:
              if (Array.isArray(expectedValue)) {
                queryBuilder.andWhere('fv.fieldId = :fieldId AND fv.value IN (:...values)', {
                  fieldId,
                  values: expectedValue
                });
              } else {
                queryBuilder.andWhere('fv.fieldId = :fieldId AND fv.value = :value', {
                  fieldId,
                  value: expectedValue
                });
              }
              break;
            default:
              queryBuilder.andWhere('fv.fieldId = :fieldId AND LOWER(fv.value) = LOWER(:value)', {
                fieldId,
                value: expectedValue
              });
          }
        });

        // Add sorting and pagination
        if (sort?.length === 2) {
          queryBuilder.orderBy(`fs.${sort[0]}`, sort[1].toUpperCase() as 'ASC' | 'DESC');
        } else {
          queryBuilder.orderBy('fs.createdAt', 'DESC');
        }

        queryBuilder
          .skip(offset)
          .take(limit);

        // Execute query
        const [results, total] = await queryBuilder.getManyAndCount();

        // Update filtered results
        filteredSubmissions = results;
        filteredCount = total;
      }

      // Get field values for filtered submissions if includeDisplayValues is true
      const formSubmissions = await Promise.all(
        filteredSubmissions.map(async (submission) => {
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
            result.customFields = await this.fieldsService.getFieldsAndFieldsValues(
              submission.itemId
            );
          }

          return result;
        })
      );

      // Return response in standard format
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
          totalCount: totalCount,
          count: filteredCount,
          formSubmissions,
        },
      };
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
        throw new BadRequestException('Invalid submission ID format. Expected a valid UUID.');
      }

      // Find the existing submission
      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        throw new BadRequestException(`Form submission ID ${submissionId} not found`);
      }

      // Update form submission if provided
      let updatedSubmission = submission;
      if (updateFormSubmissionDto.formSubmission) {
        try {
          if (updateFormSubmissionDto.formSubmission.formId) {
            submission.formId = updateFormSubmissionDto.formSubmission.formId;
          }
          // Use userId from token as itemId
          submission.itemId = userId;
          if (updateFormSubmissionDto.formSubmission.status) {
            submission.status = updateFormSubmissionDto.formSubmission.status;
          }
          submission.updatedBy = userId;

          console.log('Updating form submission with data:', {
            formId: submission.formId,
            itemId: submission.itemId,
            status: submission.status,
            updatedBy: submission.updatedBy
          });

          updatedSubmission = await this.formSubmissionRepository.save(submission);
        } catch (error) {
          throw new Error('Failed to update form submission details');
        }
      }

      // Update field values if provided
      let updatedFieldValues = [];
      if (updateFormSubmissionDto.customFields?.length > 0) {
        try {
          const fieldValuePromises = updateFormSubmissionDto.customFields.map(async (fieldValue) => {
            try {
              const existingFieldValue = await this.fieldValuesRepository
                .createQueryBuilder('fieldValue')
                .where('fieldValue.fieldId = :fieldId', { fieldId: fieldValue.fieldId })
                .andWhere('fieldValue.itemId = :itemId', { itemId: userId }) // Use userId here
                .getOne();

              if (existingFieldValue) {
                const result = await this.fieldsService.updateFieldValues(
                  existingFieldValue.fieldValuesId,
                  new FieldValuesDto({
                    fieldId: fieldValue.fieldId,
                    value: fieldValue.value,
                    itemId: userId,
                    updatedBy: userId,
                    createdBy: existingFieldValue.createdBy
                  })
                );
                return result instanceof ErrorResponseTypeOrm ? null : result;
              } else {
                const result = await this.fieldsService.createFieldValues(
                  null,
                  new FieldValuesDto({
                    fieldId: fieldValue.fieldId,
                    value: fieldValue.value,
                    itemId: userId,
                    createdBy: userId,
                    updatedBy: userId
                  })
                );
                return (result instanceof SuccessResponse && 'data' in result) ? result.data : null;
              }
            } catch (error) {
              return null;
            }
          });

          const results = await Promise.all(fieldValuePromises);
          updatedFieldValues = results.filter(result => result !== null);
        } catch (error) {
          throw new Error('Failed to update field values');
        }
      }

      // Update cohort member if provided
      let cohortMemberResult = null;
      if (updateFormSubmissionDto.cohortMember) {
        try {
          const tempResponse = {
            status: function (code) { return this; },
            json: function (data) { return data; },
          } as Response;

          const existingMember = await this.cohortMembersService.cohortUserMapping(
            submission.itemId,
            updateFormSubmissionDto.cohortMember.cohortId,
            updateFormSubmissionDto.cohortMember.cohortAcademicYearId
          );

          if (!existingMember) {
            const cohortMemberDto = new CohortMembersDto({
              cohortId: updateFormSubmissionDto.cohortMember.cohortId,
              userId: submission.itemId,
              createdBy: userId,
              updatedBy: userId,
              cohortAcademicYearId: updateFormSubmissionDto.cohortMember.cohortAcademicYearId,
              status: updateFormSubmissionDto.cohortMember.status ? updateFormSubmissionDto.cohortMember.status.toLowerCase() : MemberStatus.APPLIED,
              statusReason: updateFormSubmissionDto.cohortMember.statusReason,
              customFields: updateFormSubmissionDto.cohortMember.customFields,
              tenantId: updateFormSubmissionDto.tenantId
            });

            const result = await this.cohortMembersService.createCohortMembers(
              userId,
              cohortMemberDto,
              tempResponse,
              updateFormSubmissionDto.tenantId,
              'web',
              updateFormSubmissionDto.cohortMember.cohortAcademicYearId
            );

            if (result?.result) {
              cohortMemberResult = result.result;
            } else if (result?.responseCode === HttpStatus.CONFLICT) {
              // If member already exists, try to update instead
              const existingMember = await this.cohortMembersService.cohortUserMapping(
                submission.itemId,
                updateFormSubmissionDto.cohortMember.cohortId,
                updateFormSubmissionDto.cohortMember.cohortAcademicYearId
              );

              if (existingMember) {
                const updateDto = new CohortMembersUpdateDto({
                  cohortMembershipId: existingMember.cohortMembershipId,
                  cohortId: updateFormSubmissionDto.cohortMember.cohortId,
                  userId: submission.itemId,
                  status: updateFormSubmissionDto.cohortMember.status ? updateFormSubmissionDto.cohortMember.status.toLowerCase() : MemberStatus.APPLIED,
                  statusReason: updateFormSubmissionDto.cohortMember.statusReason,
                  customFields: updateFormSubmissionDto.cohortMember.customFields,
                  updatedBy: userId,
                  createdBy: existingMember.createdBy,
                  createdAt: existingMember.createdAt,
                  updatedAt: new Date().toISOString(),
                  cohortAcademicYearId: updateFormSubmissionDto.cohortMember.cohortAcademicYearId,
                  tenantId: updateFormSubmissionDto.tenantId
                });

                const updateResult = await this.cohortMembersService.updateCohortMembers(
                  existingMember.cohortMembershipId,
                  userId,
                  updateDto,
                  tempResponse
                );

                if (updateResult?.responseCode === HttpStatus.OK && updateResult.result) {
                  cohortMemberResult = updateResult.result;
                }
              }
            }
          } else {
            if (
              updateFormSubmissionDto.cohortMember.status === MemberStatus.DROPOUT &&
              !updateFormSubmissionDto.cohortMember.statusReason
            ) {
              throw new BadRequestException('Status reason is required when changing status to DROPOUT');
            }

            const cohortMembersUpdateDto = new CohortMembersUpdateDto({
              tenantId,
              cohortMembershipId: existingMember.cohortMembershipId,
              cohortId: updateFormSubmissionDto.cohortMember.cohortId,
              userId: submission.itemId,
              status: updateFormSubmissionDto.cohortMember.status ? updateFormSubmissionDto.cohortMember.status.toLowerCase() : existingMember.status,
              statusReason: updateFormSubmissionDto.cohortMember.statusReason || existingMember.statusReason,
              customFields: updateFormSubmissionDto.cohortMember.customFields,
              updatedBy: userId,
              createdBy: existingMember.createdBy,
              createdAt: existingMember.createdAt,
              updatedAt: new Date().toISOString(),
              cohortAcademicYearId: updateFormSubmissionDto.cohortMember.cohortAcademicYearId
            });

            const result = await this.cohortMembersService.updateCohortMembers(
              existingMember.cohortMembershipId,
              userId,
              cohortMembersUpdateDto,
              tempResponse
            );

            if (result?.responseCode === HttpStatus.OK && result.result) {
              cohortMemberResult = result.result;
            } else {
              // Get the updated cohort member details
              const updatedMember = await this.cohortMembersService.cohortUserMapping(
                submission.itemId,
                updateFormSubmissionDto.cohortMember.cohortId,
                updateFormSubmissionDto.cohortMember.cohortAcademicYearId
              );
              
              if (updatedMember) {
                cohortMemberResult = {
                  cohortMembershipId: updatedMember.cohortMembershipId,
                  cohortId: updatedMember.cohortId,
                  userId: updatedMember.userId,
                  status: updatedMember.status,
                  statusReason: updatedMember.statusReason,
                  updatedBy: updatedMember.updatedBy,
                  updatedAt: updatedMember.updatedAt,
                  cohortAcademicYearId: updatedMember.cohortAcademicYearId,
                  customFields: cohortMembersUpdateDto.customFields
                };
              }
            }
          }
        } catch (error) {
          // Continue with form submission response despite cohort member error
        }
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
          successmessage: 'Form updated successfully'
        },
        responseCode: HttpStatus.OK,
        result: {
          formSubmission: updatedSubmission,
          ...(updatedFieldValues.length > 0 && { customFields: updatedFieldValues }),
          ...(cohortMemberResult && { cohortMember: cohortMemberResult })
        }
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
          err: error instanceof BadRequestException ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          errmsg: error.message || 'An unexpected error occurred while updating the form submission',
          successmessage: null
        },
        responseCode: error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null
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
