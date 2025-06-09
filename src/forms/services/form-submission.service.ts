import { Injectable, HttpStatus, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, In } from 'typeorm';
import { FormSubmission, FormSubmissionStatus } from '../entities/form-submission.entity';
import { CreateFormSubmissionDto, FieldValueDto } from '../dto/create-form-submission.dto';
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
import { SuccessResponse } from '../../success-response';
import { PostgresCohortMembersService } from '../../adapters/postgres/cohortMembers-adapter';
import { CohortMembersDto } from '../../cohortMembers/dto/cohortMembers.dto';
import { PostgresAcademicYearService } from '../../adapters/postgres/academicyears-adapter';
import { MemberStatus } from '../../cohortMembers/entities/cohort-member.entity';
import { isUUID } from 'class-validator';
import { FormSubmissionSearchDto } from '../dto/form-submission-search.dto';

@Injectable()
export class FormSubmissionService {
  constructor(
    @InjectRepository(FormSubmission)
    private formSubmissionRepository: Repository<FormSubmission>,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>,
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    private fieldsService: FieldsService,
    private cohortMembersService: PostgresCohortMembersService,
    private academicYearService: PostgresAcademicYearService
  ) {}

  async create(
    createFormSubmissionDto: CreateFormSubmissionDto, 
    response: Response,
    cohortAcademicYearId: string
  ) {
    try {
      // Create form submission
      const formSubmission = new FormSubmission();
      formSubmission.formId = createFormSubmissionDto.formSubmission.formId;
      formSubmission.itemId = createFormSubmissionDto.formSubmission.itemId;
      formSubmission.status = createFormSubmissionDto.formSubmission.status || FormSubmissionStatus.ACTIVE;
      formSubmission.createdBy = createFormSubmissionDto.userId;
      formSubmission.updatedBy = createFormSubmissionDto.userId;

      const savedSubmission = await this.formSubmissionRepository.save(formSubmission);
      console.log("savedSubmission", savedSubmission);
      
      // Save field values using FieldsService
      for (const fieldValue of createFormSubmissionDto.customFields) {
        const fieldValueDto = new FieldValuesDto({
          fieldId: fieldValue.fieldId,
          value: fieldValue.value,
          itemId: savedSubmission.itemId,
          createdBy: createFormSubmissionDto.userId,
          updatedBy: createFormSubmissionDto.userId
        });
        
        const result = await this.fieldsService.createFieldValues(null, fieldValueDto);
        if (result instanceof ErrorResponseTypeOrm) {
          throw new BadRequestException(result.errorMessage);
        }
      }

      // Get the complete field values with field information
      const customFields = await this.fieldsService.getFieldsAndFieldsValues(savedSubmission.itemId);

      // Handle cohort member creation if cohortMember data is present
      let cohortMemberResult = null;
      if (createFormSubmissionDto.cohortMember) {
        try {
          const cohortMemberDto = new CohortMembersDto({
            cohortId: createFormSubmissionDto.cohortMember.cohortId,
            userId: savedSubmission.itemId,
            createdBy: createFormSubmissionDto.userId,
            updatedBy: createFormSubmissionDto.userId,
            cohortAcademicYearId: cohortAcademicYearId
          });
          
          // Create a new response object for cohort member creation
          const tempResponse = {
            status: function(code) {
              return this;
            },
            json: function(data) {
              return data;
            }
          } as Response;

          const result = await this.cohortMembersService.createCohortMembers(
            createFormSubmissionDto.userId,
            cohortMemberDto,
            tempResponse,
            createFormSubmissionDto.tenantId,
            'web',
            cohortAcademicYearId
          );

          // Check if the result contains data
          if (result && result.result) {
            cohortMemberResult = result.result;
          }
        } catch (error) {
          console.error('Error creating cohort member:', error);
          console.log('Continuing with form submission response despite cohort member error');
        }
      }

      // Create response object with form submission as primary focus
      const responseData = {
        id: "api.form.submission.create",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: savedSubmission.submissionId,
          status: "successful",
          err: null,
          errmsg: null,
          successmessage: "Form saved successfully"
        },
        responseCode: HttpStatus.CREATED,
        result: {
          formSubmission: savedSubmission,
          customFields,
          ...(cohortMemberResult && { cohortMember: cohortMemberResult })
        }
      };

      return response.status(HttpStatus.CREATED).json(responseData);
    } catch (error) {
      return APIResponse.error(
        response,
        "api.form.submission.create",
        API_RESPONSES.INTERNAL_SERVER_ERROR,
        error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(formSubmissionSearchDto: FormSubmissionSearchDto) {
    try {
      let { limit, offset, filters, sort, includeDisplayValues } = formSubmissionSearchDto;

      // Set default values
      offset = offset || 0;
      limit = limit || 10;

      // Get all valid form submission fields for filtering
      const formSubmissionKeys = this.formSubmissionRepository.metadata.columns.map(
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
              whereClause[key] = In(value.map(status => status.toLowerCase()));
            } else {
              whereClause[key] = value.toLowerCase();
            }
          } 
          // Handle UUID fields (exact match)
          else if (['submissionId', 'formId', 'itemId', 'createdBy', 'updatedBy'].includes(key)) {
            if (value && !isUUID(value)) {
              throw new BadRequestException(`Invalid UUID format for ${key}`);
            }
            whereClause[key] = value;
          }
          // Handle date fields
          else if (['createdAt', 'updatedAt'].includes(key)) {
            if (typeof value === 'object' && value.start && value.end) {
              whereClause[key] = Between(new Date(value.start), new Date(value.end));
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
      const [submissions, totalCount] = await this.formSubmissionRepository.findAndCount({
        where: whereClause,
        order: sort?.length === 2 ? { [sort[0]]: sort[1].toUpperCase() } : { createdAt: 'DESC' },
        skip: offset,
        take: limit,
      });

      // Handle custom field filters if any
      let filteredSubmissions = [...submissions];
      let filteredCount = submissions.length;
      if (filters?.customFieldsFilter && Object.keys(filters.customFieldsFilter).length > 0) {
        const customFieldFilters = filters.customFieldsFilter;
        
        // Get all field definitions first
        const fieldIds = Object.keys(customFieldFilters);
        const fieldDefinitions = await Promise.all(
          fieldIds.map(fieldId => this.fieldsRepository.findOne({ where: { fieldId } }))
        );

        // Create a map of fieldId to field definition
        const fieldDefinitionMap = new Map(
          fieldDefinitions.map(field => [field.fieldId, field])
        );

        // Filter submissions based on custom fields
        filteredSubmissions = [];
        for (const submission of submissions) {
          let matches = true;
          
          // Get all field values for this submission
          const fieldValues = await this.fieldValuesRepository.find({
            where: { itemId: submission.itemId }
          });

          // Check each custom field filter
          for (const [fieldId, expectedValue] of Object.entries(customFieldFilters)) {
            const fieldDef = fieldDefinitionMap.get(fieldId);
            if (!fieldDef) {
              throw new BadRequestException(`Invalid field ID: ${fieldId}`);
            }

            const fieldValue = fieldValues.find(fv => fv.fieldId === fieldId);
            if (!fieldValue) continue;

            let actualValue;
            switch (fieldDef.type) {
              case FieldType.TEXT:
                actualValue = fieldValue.textValue;
                break;
              case FieldType.NUMERIC:
                actualValue = fieldValue.numberValue;
                break;
              case FieldType.CALENDAR:
                actualValue = fieldValue.calendarValue;
                break;
              case FieldType.DROPDOWN:
                actualValue = fieldValue.dropdownValue;
                break;
              case FieldType.RADIO:
                actualValue = fieldValue.radioValue;
                break;
              case FieldType.CHECKBOX:
                actualValue = fieldValue.checkboxValue;
                break;
              case FieldType.TEXTAREA:
                actualValue = fieldValue.textareaValue;
                break;
              default:
                actualValue = fieldValue.value;
            }

            // Compare values based on field type
            let valueMatches = false;
            switch (fieldDef.type) {
              case FieldType.NUMERIC:
                valueMatches = Number(actualValue) === Number(expectedValue);
                break;
              case FieldType.CALENDAR:
                valueMatches = new Date(actualValue).getTime() === new Date(expectedValue).getTime();
                break;
              case FieldType.CHECKBOX:
                valueMatches = Boolean(actualValue) === Boolean(expectedValue);
                break;
              case FieldType.DROPDOWN:
                if (Array.isArray(expectedValue)) {
                  valueMatches = Array.isArray(actualValue) && 
                    expectedValue.every(v => actualValue.includes(v));
                } else {
                  valueMatches = actualValue === expectedValue;
                }
                break;
              default:
                valueMatches = String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();
            }

            if (!valueMatches) {
              matches = false;
              break;
            }
          }

          if (matches) {
            filteredSubmissions.push(submission);
          }
        }
        filteredCount = filteredSubmissions.length;
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
            result.customFields = await this.fieldsService.getFieldsAndFieldsValues(submission.itemId);
          }

          return result;
        })
      );

      // Return response in standard format
      return {
        id: "api.form.submission.search",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: "",
          status: "successful",
          err: null,
          errmsg: null,
          successmessage: "Form submissions retrieved successfully"
        },
        responseCode: HttpStatus.OK,
        result: {
          totalCount: totalCount,
          count: filteredCount,
          formSubmissions
        }
      };
    } catch (error) {
      console.error('Error in findAll:', error);
      return {
        id: "api.form.submission.search",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: "",
          status: "failed",
          err: "SEARCH_FAILED",
          errmsg: error.message || "An unexpected error occurred while searching form submissions",
          successmessage: null
        },
        responseCode: error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null
      };
    }
  }

  async findOne(submissionId: string) {
    try {
      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        return {
          id: "api.form.submission.get",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "INVALID_SUBMISSION_ID",
            errmsg: "Invalid submission ID format. Expected a valid UUID.",
            successmessage: null
          },
          responseCode: HttpStatus.BAD_REQUEST,
          result: null
        };
      }

      // Find the form submission
      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        return {
          id: "api.form.submission.get",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "SUBMISSION_NOT_FOUND",
            errmsg: `Form submission ID ${submissionId} not found`,
            successmessage: null
          },
          responseCode: HttpStatus.NOT_FOUND,
          result: null
        };
      }

      // Get field values using the existing FieldsService
      const customFields = await this.fieldsService.getFieldsAndFieldsValues(submission.itemId);

      // Create response object
      return {
        id: "api.form.submission.get",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "successful",
          err: null,
          errmsg: null,
          successmessage: "Form submission details retrieved successfully"
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
          customFields
        }
      };
    } catch (error) {
      return {
        id: "api.form.submission.get",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "failed",
          err: "FETCH_FAILED",
          errmsg: error.message || "An unexpected error occurred while fetching the form submission",
          successmessage: null
        },
        responseCode: error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null
      };
    }
  }

  async update(submissionId: string, updateFormSubmissionDto: UpdateFormSubmissionDto, tenantId: string) {
    try {
      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        return {
          id: "api.form.submission.update",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "INVALID_SUBMISSION_ID",
            errmsg: "Invalid submission ID format. Expected a valid UUID.",
            successmessage: null
          },
          responseCode: HttpStatus.BAD_REQUEST,
          result: null
        };
      }

      // Find the existing submission
      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        return {
          id: "api.form.submission.update",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "SUBMISSION_NOT_FOUND",
            errmsg: `Form submission ID ${submissionId} not found`,
            successmessage: null
          },
          responseCode: HttpStatus.NOT_FOUND,
          result: null
        };
      }

      // Update form submission if provided
      let updatedSubmission = submission;
      if (updateFormSubmissionDto.formSubmission) {
        // Update only allowed fields
        if (updateFormSubmissionDto.formSubmission.formId) {
          submission.formId = updateFormSubmissionDto.formSubmission.formId;
        }
        if (updateFormSubmissionDto.formSubmission.itemId) {
          submission.itemId = updateFormSubmissionDto.formSubmission.itemId;
        }
        if (updateFormSubmissionDto.formSubmission.status) {
          submission.status = updateFormSubmissionDto.formSubmission.status;
        }
        // Always update the updatedBy field if provided
        if (updateFormSubmissionDto.updatedBy) {
          submission.updatedBy = updateFormSubmissionDto.updatedBy;
        }
        updatedSubmission = await this.formSubmissionRepository.save(submission);
      }

      // Update field values if provided
      const updatedFieldValues = [];
      if (updateFormSubmissionDto.customFields && updateFormSubmissionDto.customFields.length > 0) {
        for (const fieldValue of updateFormSubmissionDto.customFields) {
          const fieldValueDto = new FieldValuesDto({
            fieldId: fieldValue.fieldId,
            value: fieldValue.value,
            itemId: submission.itemId,
            updatedBy: updateFormSubmissionDto.updatedBy
          });

          // If fieldValueId is provided, update existing field value
          const existingFieldValue = await this.fieldValuesRepository.findOne({
            where: { 
              fieldId: fieldValue.fieldId,
              itemId: submission.itemId
            }
          });

          if (existingFieldValue) {
            const result = await this.fieldsService.updateFieldValues(existingFieldValue.fieldValuesId, fieldValueDto);
            if (result instanceof ErrorResponseTypeOrm) {
              throw new BadRequestException(result.errorMessage);
            }
            if (result instanceof SuccessResponse && result.data) {
              updatedFieldValues.push(result.data);
            }
          } else {
            // If no existing field value found, create new one
            const result = await this.fieldsService.createFieldValues(null, fieldValueDto);
            if (result instanceof ErrorResponseTypeOrm) {
              throw new BadRequestException(result.errorMessage);
            }
            if (result instanceof SuccessResponse && result.data) {
              updatedFieldValues.push(result.data);
            }
          }
        }
      }

      // Update cohort member if provided
      let cohortMemberResult = null;
      if (updateFormSubmissionDto.cohortMember) {
        try {
          // Create a new response object for cohort member update
          const tempResponse = {
            status: function(code) {
              return this;
            },
            json: function(data) {
              return data;
            }
          } as Response;

          // Ensure cohortMembershipId is set in the update DTO
          if (!updateFormSubmissionDto.cohortMember.cohortMembershipId) {
            // Try to find existing cohort membership using the service's method
            const cohortMembers = await this.cohortMembersService.getCohortMemberUserDetails(
              {
                userId: submission.itemId,
                cohortId: updateFormSubmissionDto.cohortMember.cohortId
              },
              'false',
              { limit: 1, offset: 0 },
              {}
            );

            if (!cohortMembers || !cohortMembers.userDetails || cohortMembers.userDetails.length === 0) {
              throw new BadRequestException('Cohort membership not found for update');
            }
            updateFormSubmissionDto.cohortMember.cohortMembershipId = cohortMembers.userDetails[0].cohortMembershipId;
          }

          // Validate status and statusReason
          if (updateFormSubmissionDto.cohortMember.status === MemberStatus.DROPOUT && !updateFormSubmissionDto.cohortMember.statusReason) {
            throw new BadRequestException('Status reason is required when changing status to DROPOUT');
          }

          // Create a proper CohortMembersUpdateDto object
          const cohortMembersUpdateDto = {
            tenantId: tenantId,
            cohortMembershipId: updateFormSubmissionDto.cohortMember.cohortMembershipId,
            cohortId: updateFormSubmissionDto.cohortMember.cohortId,
            userId: updateFormSubmissionDto.cohortMember.userId || submission.itemId,
            status: updateFormSubmissionDto.cohortMember.status,
            statusReason: updateFormSubmissionDto.cohortMember.statusReason,
            customFields: updateFormSubmissionDto.cohortMember.customFields,
            updatedBy: updateFormSubmissionDto.updatedBy,
            createdBy: updateFormSubmissionDto.cohortMember.createdBy,
            createdAt: updateFormSubmissionDto.cohortMember.createdAt,
            updatedAt: updateFormSubmissionDto.cohortMember.updatedAt
          };

          // Call the cohort member update service
          const result = await this.cohortMembersService.updateCohortMembers(
            cohortMembersUpdateDto.cohortMembershipId,
            updateFormSubmissionDto.updatedBy,
            cohortMembersUpdateDto,
            tempResponse
          );

          // Check if the update was successful
          if (result && result.statusCode === HttpStatus.OK) {
            cohortMemberResult = result.result;
          } else {
            // Log the error but don't throw it to maintain form submission flow
            console.error('Error updating cohort member:', result);
            console.log('Continuing with form submission response despite cohort member error');
          }
        } catch (error) {
          console.error('Error updating cohort member:', error);
          // Don't throw error, just log it and continue
          console.log('Continuing with form submission response despite cohort member error');
        }
      }

      // Create response object with form submission as primary focus
      return {
        id: "api.form.submission.update",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "successful",
          err: null,
          errmsg: null,
          successmessage: "Form updated successfully"
        },
        responseCode: HttpStatus.OK,
        result: {
          formSubmission: updatedSubmission,
          ...(updatedFieldValues.length > 0 && { customFields: updatedFieldValues }),
          ...(cohortMemberResult && { cohortMember: cohortMemberResult })
        }
      };
    } catch (error) {
      return {
        id: "api.form.submission.update",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "failed",
          err: "UPDATE_FAILED",
          errmsg: error.message || "An unexpected error occurred while updating the form submission",
          successmessage: null
        },
        responseCode: error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null
      };
    }
  }

  async remove(submissionId: string, mode: 'soft' | 'hard' = 'soft') {
    try {
      // Validate submissionId is a UUID
      if (!isUUID(submissionId)) {
        return {
          id: "api.form.submission.delete",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "INVALID_SUBMISSION_ID",
            errmsg: "Invalid submission ID format. Expected a valid UUID.",
            successmessage: null
          },
          responseCode: HttpStatus.BAD_REQUEST,
          result: null
        };
      }

      const submission = await this.formSubmissionRepository.findOne({
        where: { submissionId },
      });

      if (!submission) {
        return {
          id: "api.form.submission.delete",
          ver: "1.0",
          ts: new Date().toISOString(),
          params: {
            resmsgid: submissionId,
            status: "failed",
            err: "SUBMISSION_NOT_FOUND",
            errmsg: `Form submission ID ${submissionId} not found`,
            successmessage: null
          },
          responseCode: HttpStatus.NOT_FOUND,
          result: null
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
        id: "api.form.submission.delete",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "successful",
          err: null,
          errmsg: null,
          successmessage: mode === 'hard' ? "Form submission permanently deleted" : "Form submission archived"
        },
        responseCode: HttpStatus.OK,
        result: {
          submissionId: result.submissionId,
          status: mode === 'hard' ? 'deleted' : result.status
        }
      };
    } catch (error) {
      return {
        id: "api.form.submission.delete",
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: submissionId,
          status: "failed",
          err: "DELETE_FAILED",
          errmsg: error.message || "An unexpected error occurred while deleting the form submission",
          successmessage: null
        },
        responseCode: error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        result: null
      };
    }
  }
} 