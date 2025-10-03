import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import jwt_decode from 'jwt-decode';
import { InjectRepository } from '@nestjs/typeorm';
import { Form } from './entities/form.entity';
import { IsNull, Repository, In } from 'typeorm';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import APIResponse from 'src/common/responses/response';
import { CohortContextType } from './utils/form-class';
import { FormCreateDto } from './dto/form-create.dto';
import { FormCopyDto } from './dto/form-copy.dto';
import { FieldsDto } from '../fields/dto/fields.dto';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { FormStatus } from './dto/form-create.dto';

@Injectable()
export class FormsService {
  constructor(
    private readonly fieldsService: PostgresFieldsService,
    @InjectRepository(Form)
    private readonly formRepository: Repository<Form>
  ) {}

  async getForm(requiredData, response) {
    let apiId = APIID.FORM_GET;
    try {
      if (!requiredData.context && !requiredData.contextType) {
        return APIResponse.error(
          response,
          apiId,
          'BAD_REQUEST',
          'Context in Query Params is required',
          HttpStatus.BAD_REQUEST
        );
      }

      const { context, contextType, tenantId, contextId, formType } =
        requiredData;

      if (contextId && typeof contextId !== 'string') {
        return APIResponse.error(
          response,
          apiId,
          'BAD_REQUEST',
          'contextId must be a string',
          HttpStatus.BAD_REQUEST
        );
      }

      const validationResult = await this.validateFormInput(requiredData);

      if (validationResult.error) {
        return APIResponse.error(
          response,
          apiId,
          'BAD_REQUEST',
          validationResult.error,
          HttpStatus.BAD_REQUEST
        );
      }

      const query: any = { context };

      if (contextType) {
        query.contextType = contextType;
      } else {
        query.contextType = null;
      }
      if (tenantId) {
        query.tenantId = tenantId;
      }

      if (contextId) {
        query.contextId = contextId;
      } else {
        query.contextId = null;
      }

      const formData = await this.getFormData(query);
      if (!formData) {
        return APIResponse.error(
          response,
          apiId,
          'NOT_FOUND',
          'No Data found for this context OR Context Type OR Context Id',
          HttpStatus.NOT_FOUND
        );
      }
      // Check for status === 'archived'
      if (!formData || formData.status === 'archived') {
        return APIResponse.error(
          response,
          apiId,
          'NOT_FOUND',
          'No Data found for this context OR Context Type OR Context Id',
          HttpStatus.NOT_FOUND
        );
      }
      // Return raw fields if formType is 'rjsf'
      if (formType === 'rjsf') {
        const result: {
          formid: any;
          title: any;
          status: any;
          fields: any;
          requiredFields?: string[] | null;
        } = {
          formid: formData.formid,
          title: formData.title,
          status: formData.status,
          fields: formData.fields,
        };

        // Conditionally include requiredFields only if fetchRequired === 'yes'
        if (requiredData.fetchRequired === 'yes') {
          const requiredFields = formData.fields?.result
            ?.flatMap((item) =>
              Array.isArray(item.schema?.required) ? item.schema.required : []
            )
            ?.filter((v, i, self) => self.indexOf(v) === i); // remove duplicates

          result.requiredFields =
            requiredFields.length > 0 ? requiredFields : null;
        }

        return APIResponse.success(
          response,
          apiId,
          result,
          HttpStatus.OK,
          'Fields fetched successfully.'
        );
      }

      // Default or "core" formType (existing logic)
      const mappedResponse = await Promise.all(
        formData.fields.result.map(async (data) => {
          if (!data.coreField) {
            const whereClause = `"fieldId" = '${data.fieldId}'`;
            const [customFieldData] = await this.fieldsService.getFieldData(
              whereClause
            );
            customFieldData.order = data.order;
            return customFieldData;
          }
          return data;
        })
      );

      const result = {
        formid: formData.formid,
        title: formData.title,
        status: formData.status,
        fields: mappedResponse,
      };

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        'Fields fetched successfully.'
      );
    } catch (error) {
      const errorMessage = error.message || 'Internal server error';
      return APIResponse.error(
        response,
        apiId,
        'INTERNAL_SERVER_ERROR',
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getFormData(whereClause): Promise<any> {
    let query = this.formRepository
      .createQueryBuilder('form')
      .select(['form.formid', 'form.title', 'form.status', 'form.fields'])
      .where('form.context = :context', { context: whereClause.context })
      .andWhere('form.status != :archivedStatus', {
        archivedStatus: FormStatus.ARCHIVED,
      }); // Exclude archived forms

    if (whereClause.contextType !== undefined) {
      if (whereClause.contextType === null) {
        query = query.andWhere('form.contextType IS NULL');
      } else {
        query = query.andWhere('form.contextType = :contextType', {
          contextType: whereClause.contextType,
        });
      }
    }
    if (whereClause.tenantId) {
      query = query.andWhere('form.tenantId = :tenantId', {
        tenantId: whereClause.tenantId,
      });
    } else {
      query = query.andWhere('form.tenantId IS NULL');
    }

    if (whereClause.contextId) {
      query = query.andWhere('form.contextId = :contextId', {
        contextId: whereClause.contextId,
      });
    } else {
      query = query.andWhere('form.contextId IS NULL');
    }
    const result = await query.getOne();
    return result || false;
  }

  async checkValidUserContextType() {
    const query = `select name from "Roles" r`;
    const roleName = await this.formRepository.query(query);
    return roleName;
  }

  private async getUserContextTypesFromDB(): Promise<string[]> {
    const roleNames = await this.checkValidUserContextType();
    return roleNames.map((role) => role.name.toUpperCase());
  }

  private async validateFormInput(
    requiredData: any
  ): Promise<{ error: string | null }> {
    delete requiredData.tenantId;
    const allowedKeys = [
      'context',
      'contextType',
      'contextId',
      'userId',
      'formType',
      'fetchRequired',
    ];
    const extraKeys = Object.keys(requiredData).filter(
      (key) => !allowedKeys.includes(key)
    );

    if (extraKeys.length > 0) {
      return {
        error: `Invalid keys provided: ${extraKeys.join(
          ', '
        )}. Only ${allowedKeys.join(', ')} are allowed.`,
      };
    }

    const { context, contextType, formType } = requiredData;

    // Validate formType
    const validFormTypes = ['core', 'rjsf'];
    if (formType && !validFormTypes.includes(formType)) {
      return {
        error: `Invalid formType: '${formType}'. Allowed values are: ${validFormTypes.join(
          ', '
        )}`,
      };
    }

    if (context) {
      const validContextTypes = await this.getValidContextTypes(context);
      if (validContextTypes.length === 0) {
        return { error: `Invalid context: ${context}` };
      }
      if (contextType && !validContextTypes.includes(contextType)) {
        return {
          error: `Invalid contextType. For the context '${context}', it must be one of: ${validContextTypes.join(
            ', '
          )}`,
        };
      }
    }

    return { error: null };
  }

  private async getValidContextTypes(context: string): Promise<string[]> {
    switch (context.toLowerCase()) {
      case 'users':
        return await this.getUserContextTypesFromDB();
      case 'cohorts':
        return Object.values(CohortContextType);
      case 'cohortmember':
        return ['COHORTMEMBER'];
      case 'tenant':
        return ['TENANT'];
      case 'center':
        return ['CENTER'];
      case 'cohort':
        return ['COHORT'];
      default:
        return [];
    }
  }

  public async createForm(request, formCreateDto: FormCreateDto, response) {
    let apiId = APIID.FORM_CREATE;

    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      formCreateDto.createdBy = decoded?.sub;
      formCreateDto.updatedBy = decoded?.sub;

      formCreateDto.contextType = formCreateDto.contextType.toUpperCase();
      formCreateDto.context = formCreateDto.context.toUpperCase();
      formCreateDto.title = formCreateDto.title.toUpperCase();

      formCreateDto.tenantId = formCreateDto.tenantId.trim().length
        ? formCreateDto.tenantId
        : null;
      // Updated status assignment using enum safely
      if (
        formCreateDto.status &&
        Object.values(FormStatus).includes(
          formCreateDto.status.toLowerCase() as FormStatus
        )
      ) {
        formCreateDto.status = formCreateDto.status.toLowerCase() as FormStatus;
      } else {
        formCreateDto.status = FormStatus.ACTIVE; // default to active
      }
      let checkFormExists;

      if (formCreateDto.contextId) {
        // If contextId is provided, include it in the uniqueness check
        checkFormExists = await this.formRepository.find({
          where: {
            context: formCreateDto.context,
            contextType: formCreateDto.contextType,
            tenantId: formCreateDto.tenantId || IsNull(),
            contextId: formCreateDto.contextId,
            status: formCreateDto.status,
          },
        });
      } else {
        // If contextId is not provided, exclude it from the check and ensure contextId is null
        checkFormExists = await this.formRepository.find({
          where: {
            context: formCreateDto.context,
            contextType: formCreateDto.contextType,
            tenantId: formCreateDto.tenantId || IsNull(),
            contextId: IsNull(),
            status: formCreateDto.status,
          },
        });
      }

      if (checkFormExists.length) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.FORM_EXISTS,
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }

      const validForm = await this.validateFormFields(
        formCreateDto.fields?.result
      );

      if (!validForm) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_FORM,
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }

      const validContextTypes = await this.getValidContextTypes(
        formCreateDto.context
      );
      if (validContextTypes.length === 0) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_CONTEXT(formCreateDto.context),
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }
      if (
        formCreateDto.contextType &&
        !validContextTypes.includes(formCreateDto.contextType)
      ) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_CONTEXTTYPE(
            formCreateDto.context,
            validContextTypes.join(', ')
          ),
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.formRepository.save(formCreateDto);

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.FORM_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || 'Internal server error';
      return APIResponse.error(
        response,
        apiId,
        'INTERNAL_SERVER_ERROR',
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async validateFormFields(formFields) {
    const fieldIds = [];
    if (Array.isArray(formFields)) {
      for (const element of formFields) {
        if (element['coreField'] === 0 && element['fieldId']?.trim().length) {
          fieldIds.push(element['fieldId']);
        } else if (
          (element['coreField'] === 0 && !element['fieldId']) ||
          (element['coreField'] === 1 && element['fieldId'] !== null)
        ) {
          return false;
        }
      }

      const fieldsData = await this.fieldsService.getFieldsByIds(fieldIds);

      if (fieldsData.length === fieldIds.length) {
        return true;
      }
      return false;
    }
  }

  async getFormDetail(
    context: string,
    contextType: string,
    tenantId: string,
    contextId: string
  ) {
    return await this.formRepository.find({
      where: {
        context,
        contextType,
        tenantId: tenantId || IsNull(),
        contextId,
      },
    });
  }

  public async updateForm(
    request,
    formId: string,
    formUpdateDto: FormCreateDto,
    response
  ) {
    const apiId = APIID.FORM_UPDATE;

    try {
      const decoded: any = jwt_decode(request.headers.authorization);

      const existingForm = await this.formRepository.findOne({
        where: { formid: formId },
      });

      if (!existingForm) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.FORM_NOT_FOUND,
          'NOT_FOUND',
          HttpStatus.NOT_FOUND
        );
      }

      formUpdateDto.updatedBy = decoded?.sub;
      if (formUpdateDto.contextType)
        formUpdateDto.contextType = formUpdateDto.contextType.toUpperCase();
      if (formUpdateDto.context)
        formUpdateDto.context = formUpdateDto.context.toUpperCase();
      if (formUpdateDto.title)
        formUpdateDto.title = formUpdateDto.title.toUpperCase();

      // Normalize and validate status enum
      if (formUpdateDto.status) {
        const normalizedStatus = formUpdateDto.status.toString().toLowerCase();
        if (
          Object.values(FormStatus).includes(normalizedStatus as FormStatus)
        ) {
          formUpdateDto.status = normalizedStatus as FormStatus;

          // If status is being changed to archived, archive all associated fields
          if (normalizedStatus === FormStatus.ARCHIVED) {
            try {
              // Check if form has fields data
              if (!existingForm.fields) {
                // Continue with form archival even if no fields found
              } else {
                // Function to recursively find all fieldIds in an object
                const findFieldIds = (obj: any): string[] => {
                  const fieldIds: string[] = [];

                  if (!obj) return fieldIds;

                  if (typeof obj === 'object') {
                    // If object has fieldId property, add it
                    if (obj.fieldId) {
                      fieldIds.push(obj.fieldId);
                    }

                    // Recursively search all object values
                    Object.values(obj).forEach((value) => {
                      if (typeof value === 'object') {
                        fieldIds.push(...findFieldIds(value));
                      }
                    });
                  }

                  return fieldIds;
                };

                // Get all fieldIds from the fields JSON
                const fieldIds = findFieldIds(existingForm.fields);

                // Remove duplicates and filter out any undefined/null values
                const uniqueFieldIds = [...new Set(fieldIds)].filter(Boolean);

                if (uniqueFieldIds.length > 0) {
                  // Archive all fields in a single operation
                  try {
                    await this.fieldsService.archiveFieldsByIds(
                      uniqueFieldIds,
                      decoded?.sub
                    );
                  } catch (error) {
                    console.error('Error archiving fields:', error);
                    // Continue with form archival even if field archival fails
                  }
                }
              }

              // Proceed with form update regardless of field archival status
              const updatedForm = Object.assign(existingForm, formUpdateDto);
              const saved = await this.formRepository.save(updatedForm);

              return APIResponse.success(
                response,
                apiId,
                saved,
                HttpStatus.OK,
                API_RESPONSES.FORM_UPDATED_SUCCESSFULLY
              );
            } catch (error) {
              return APIResponse.error(
                response,
                apiId,
                'Error during form archival process',
                error.message || 'Internal server error',
                HttpStatus.INTERNAL_SERVER_ERROR
              );
            }
          }
        } else {
          return APIResponse.error(
            response,
            apiId,
            'Invalid status value',
            'BAD_REQUEST',
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const validForm = await this.validateFormFields(
        formUpdateDto.fields?.result
      );
      if (formUpdateDto.fields && !validForm) {
        return APIResponse.error(
          response,
          apiId,
          API_RESPONSES.INVALID_FORM,
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST
        );
      }

      // Inside your updateForm method, after status handling:
      if (formUpdateDto.rules) {
        try {
          // Optional: Validate that rules is a valid JSON object
          if (typeof formUpdateDto.rules !== 'object') {
            formUpdateDto.rules = JSON.parse(formUpdateDto.rules);
          }
        } catch (err: any) {
          console.error('Error parsing rules:', err.message ?? err);
          return APIResponse.error(
            response,
            apiId,
            'BAD_REQUEST',
            'Invalid rules JSON format',
            HttpStatus.BAD_REQUEST
          );
        }
      }

      const updatedForm = Object.assign(existingForm, formUpdateDto);
      const saved = await this.formRepository.save(updatedForm);

      return APIResponse.success(
        response,
        apiId,
        saved,
        HttpStatus.OK,
        API_RESPONSES.FORM_UPDATED_SUCCESSFULLY
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        error.message || 'Internal server error',
        'INTERNAL_SERVER_ERROR',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Retrieves a form by its ID.
   * @param formId The ID of the form to retrieve.
   * @returns A Promise that resolves to the Form entity.
   * @throws NotFoundException if the form with the given ID does not exist.
   */
  async getFormById(formId: string): Promise<Form> {
    try {
      const form = await this.formRepository.findOne({
        where: { formid: formId },
      });

      if (!form) {
        throw new NotFoundException(`Form with ID ${formId} not found`);
      }

      return form;
    } catch (error) {
      Logger.error(
        `Failed to get form by ID ${formId}: ${error.message}`,
        error.stack,
        FormsService.name // context string for log origin
      );
      throw error;
    }
  }

  /**
   * Copies an existing form to a new cohort with all its fields and rules.
   * @param request The HTTP request object containing JWT token
   * @param formCopyDto The form copy data containing source formId and target cohortId
   * @param response The HTTP response object
   * @returns API response with the copied form data
   */
  async copyForm(request: any, formCopyDto: FormCopyDto, response: any) {
    let apiId = APIID.FORM_COPY;

    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      const createdBy = decoded?.sub;
      const updatedBy = decoded?.sub;

      // Fetch the source form
      const sourceForm = await this.getFormById(formCopyDto.formId);

      // Check if target cohort already has a form in draft or active state
      const existingForm = await this.formRepository.findOne({
        where: {
          contextId: formCopyDto.cohortId,
          status: In([FormStatus.DRAFT, FormStatus.ACTIVE])
        }
      });

      if (existingForm) {
        return APIResponse.error(
          response,
          apiId,
          'CONFLICT',
          'This cohort already has an application form in draft or published state. To continue, please unpublish the current application form before proceeding.',
          HttpStatus.CONFLICT
        );
      }

      // Extract all fieldIds from the fields JSON using optimized method
      const fieldIdMapping = new Map<string, string>();
      const foundFieldIds = this.extractFieldIdsFromJson(sourceForm.fields, sourceForm.rules);

      if (foundFieldIds.size === 0) {
        Logger.warn('No fieldIds found in source form');
      } else {
        Logger.log(`Found ${foundFieldIds.size} unique fieldIds to process`);

        // Bulk fetch all original fields at once
        const originalFields = await this.bulkFetchFields(Array.from(foundFieldIds));

        // Check for existing fields in target cohort in bulk
        const existingFields = await this.bulkCheckExistingFields(formCopyDto.cohortId, Array.from(foundFieldIds));

        // Prepare fields for bulk creation
        const fieldsToCreate = [];
        const fieldsToMap = new Map<string, string>();

        for (const fieldId of foundFieldIds) {
          // Check if field already exists in target cohort
          if (existingFields.has(fieldId)) {
            fieldsToMap.set(fieldId, fieldId); // Map to itself since it already exists
            continue;
          }

          const originalField = originalFields.get(fieldId);
          if (originalField) {
            // Prepare field data for bulk creation
            const newFieldData = this.prepareFieldDataForCopy(originalField, formCopyDto.cohortId, createdBy, updatedBy);
            fieldsToCreate.push(newFieldData);
            // We'll map the fieldId after bulk creation
          } else {
            Logger.warn(`Original field not found for fieldId: ${fieldId}`);
          }
        }

        // Bulk create all fields at once
        if (fieldsToCreate.length > 0) {
          Logger.log(`Creating ${fieldsToCreate.length} fields in bulk`);
          const createdFields = await this.bulkCreateFields(fieldsToCreate);

          // Map created fields back to original fieldIds
          for (let i = 0; i < fieldsToCreate.length; i++) {
            const originalFieldId = fieldsToCreate[i].originalFieldId;
            const createdField = createdFields[i];
            if (createdField && createdField.fieldId) {
              fieldsToMap.set(originalFieldId, createdField.fieldId);
              Logger.log(`Successfully created field ${createdField.fieldId} for field ${originalFieldId}`);
            }
          }
        }

        // Update the fieldIdMapping with all mappings
        fieldIdMapping.clear();
        for (const [oldId, newId] of fieldsToMap) {
          fieldIdMapping.set(oldId, newId);
        }

        Logger.log(`Field mapping completed: ${fieldIdMapping.size} fields processed`);
      }

      // Update field IDs in both fields and rules JSON
      const updatedFields = this.updateFieldIdsInJson(sourceForm.fields, fieldIdMapping);
      const updatedRules = sourceForm.rules ? this.updateFieldIdsInJson(sourceForm.rules, fieldIdMapping) : sourceForm.rules;

      // Create the new form data with updated field IDs
      const newFormData: FormCreateDto = {
        tenantId: sourceForm.tenantId,
        title: sourceForm.title,
        context: sourceForm.context,
        contextType: sourceForm.contextType,
        contextId: formCopyDto.cohortId,
        status: FormStatus.DRAFT,
        createdBy,
        updatedBy,
        fields: updatedFields,
        rules: updatedRules,
      };

      // Create the new form using existing createForm method
      const createFormResult = await this.createForm(request, newFormData, response);

      // If form creation failed, return the error
      if (createFormResult.statusCode !== 200) {
        return createFormResult;
      }

      const newForm = createFormResult.data;

      return APIResponse.success(
        response,
        apiId,
        newForm,
        HttpStatus.OK,
        'Form copied successfully to the new cohort.'
      );

    } catch (error) {
      const errorMessage = error.message || 'Internal server error';
      return APIResponse.error(
        response,
        apiId,
        'INTERNAL_SERVER_ERROR',
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Creates a field directly in the database without HTTP responses
   * @param fieldData The field data to create
   * @param createdBy The user who created the field
   * @param updatedBy The user who last updated the field
   * @returns The created field entity
   */
  private async createFieldDirectly(fieldData: FieldsDto, createdBy: string, updatedBy: string): Promise<any> {
    try {
      // Convert fieldData to plain object and spread all properties
      const fieldsData: any = {
        ...fieldData, // Spread all properties from the original field
        // Override only the properties that need to change for the new field
        contextId: (fieldData as any).contextId, // This is the new cohortId
        createdBy,
        updatedBy,
        status: 'active',
        // Ensure ordering is not null (required field)
        ordering: fieldData.ordering || 0,
        // Ensure required field has a default value
        required: (fieldData as any).required !== undefined ? (fieldData as any).required : true,
        // Ensure dependsOn is not undefined
        dependsOn: fieldData.dependsOn || null,
        // Handle JSON fields - convert objects to strings for database storage
        fieldParams: fieldData.fieldParams ? 
          (typeof fieldData.fieldParams === 'string' ? fieldData.fieldParams : JSON.stringify(fieldData.fieldParams)) : 
          null,
        fieldAttributes: fieldData.fieldAttributes ? 
          (typeof fieldData.fieldAttributes === 'string' ? fieldData.fieldAttributes : JSON.stringify(fieldData.fieldAttributes)) : 
          null,
        sourceDetails: fieldData.sourceDetails ? 
          (typeof fieldData.sourceDetails === 'string' ? fieldData.sourceDetails : JSON.stringify(fieldData.sourceDetails)) : 
          null,
      };

      // Create the field using the fields service repository directly
      const result = await this.fieldsService.createFieldDirectly(fieldsData);

      return result;
    } catch (error) {
      Logger.error(`Error creating field directly: ${error.message}`);
      throw error;
    }
  }

  /**
   * Optimized method to extract fieldIds from JSON using recursive traversal
   * @param fieldsJson The fields JSON object
   * @param rulesJson The rules JSON object (optional)
   * @returns Set of unique fieldIds found
   */
  private extractFieldIdsFromJson(fieldsJson: any, rulesJson?: any): Set<string> {
    const fieldIds = new Set<string>();

    const extractFromObject = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.fieldId && typeof obj.fieldId === 'string') {
        fieldIds.add(obj.fieldId);
      }

      // Recursively search all object values
      Object.values(obj).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(item => extractFromObject(item));
        } else if (typeof value === 'object') {
          extractFromObject(value);
        }
      });
    };

    // Extract from fields JSON
    if (fieldsJson) {
      extractFromObject(fieldsJson);
    }

    // Extract from rules JSON
    if (rulesJson) {
      extractFromObject(rulesJson);
    }

    return fieldIds;
  }

  /**
   * Bulk fetch multiple fields by their IDs
   * @param fieldIds Array of field IDs to fetch
   * @returns Map of fieldId to field data
   */
  private async bulkFetchFields(fieldIds: string[]): Promise<Map<string, any>> {
    if (fieldIds.length === 0) return new Map();

    try {
      const fields = await this.fieldsService.getFieldsByIds(fieldIds);
      const fieldMap = new Map<string, any>();

      fields.forEach(field => {
        if (field && field.fieldId) {
          fieldMap.set(field.fieldId, field);
        }
      });

      return fieldMap;
    } catch (error) {
      Logger.error(`Error bulk fetching fields: ${error.message}`);
      return new Map();
    }
  }

  /**
   * Bulk check if fields already exist in target cohort
   * @param cohortId The target cohort ID
   * @param fieldIds Array of field IDs to check
   * @returns Set of fieldIds that already exist in target cohort
   */
  private async bulkCheckExistingFields(cohortId: string, fieldIds: string[]): Promise<Set<string>> {
    if (fieldIds.length === 0) return new Set();

    try {
      const existingFields = await this.fieldsService.getFieldsByContextIdAndFieldIds(cohortId, fieldIds);
      return new Set(existingFields.map(field => field.fieldId));
    } catch (error) {
      Logger.error(`Error checking existing fields: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Prepare field data for copying with all necessary properties
   * @param originalField The original field data
   * @param cohortId The target cohort ID
   * @param createdBy The user creating the field
   * @param updatedBy The user updating the field
   * @returns Prepared field data for bulk creation
   */
  private prepareFieldDataForCopy(originalField: any, cohortId: string, createdBy: string, updatedBy: string): any {
    return {
      ...originalField, // Spread all properties from the original field
      contextId: cohortId, // Override only the contextId (cohortId)
      createdBy,
      updatedBy,
      status: 'active',
      // Ensure critical fields have proper values
      ordering: originalField.ordering || 0,
      required: originalField.required !== undefined ? originalField.required : true,
      dependsOn: originalField.dependsOn || null,
      // Handle JSON fields - convert objects to strings for database storage
      fieldParams: originalField.fieldParams ? 
        (typeof originalField.fieldParams === 'string' ? originalField.fieldParams : JSON.stringify(originalField.fieldParams)) : 
        null,
      fieldAttributes: originalField.fieldAttributes ? 
        (typeof originalField.fieldAttributes === 'string' ? originalField.fieldAttributes : JSON.stringify(originalField.fieldAttributes)) : 
        null,
      sourceDetails: originalField.sourceDetails ? 
        (typeof originalField.sourceDetails === 'string' ? originalField.sourceDetails : JSON.stringify(originalField.sourceDetails)) : 
        null,
      // Store original fieldId for mapping after creation
      originalFieldId: originalField.fieldId,
    };
  }

  /**
   * Bulk create multiple fields at once
   * @param fieldsData Array of field data to create
   * @returns Array of created field entities
   */
  private async bulkCreateFields(fieldsData: any[]): Promise<any[]> {
    if (fieldsData.length === 0) return [];

    try {
      return await this.fieldsService.bulkCreateFields(fieldsData);
    } catch (error) {
      Logger.error(`Error bulk creating fields: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper method to recursively update field IDs in JSON objects
   * @param obj The object to update
   * @param fieldIdMapping Map of old fieldId to new fieldId
   * @returns Updated object with new field IDs
   */
  private updateFieldIdsInJson(obj: any, fieldIdMapping: Map<string, string>): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.updateFieldIdsInJson(item, fieldIdMapping));
    }

    if (typeof obj === 'object') {
      const updatedObj = { ...obj };

      // If this object has a fieldId property, update it
      if (updatedObj.fieldId && fieldIdMapping.has(updatedObj.fieldId)) {
        updatedObj.fieldId = fieldIdMapping.get(updatedObj.fieldId);
      }

      // Recursively update all properties
      for (const key in updatedObj) {
        if (updatedObj.hasOwnProperty(key)) {
          updatedObj[key] = this.updateFieldIdsInJson(updatedObj[key], fieldIdMapping);
        }
      }

      return updatedObj;
    }

    return obj;
  }
}
