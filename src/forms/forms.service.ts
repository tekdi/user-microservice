import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import jwt_decode from 'jwt-decode';
import { InjectRepository } from '@nestjs/typeorm';
import { Form } from './entities/form.entity';
import { IsNull, Repository } from 'typeorm';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import APIResponse from 'src/common/responses/response';
import { CohortContextType } from './utils/form-class';
import { FormCreateDto } from './dto/form-create.dto';
import { APIID } from '@utils/api-id.config';
import { API_RESPONSES } from '@utils/response.messages';
import { FormStatus } from './dto/form-create.dto';
import { FieldStatus } from '../fields/entities/fields.entity';
import { FieldsUpdateDto } from '../fields/dto/fields-update.dto';
import { In } from 'typeorm';

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
          'No Data found for this context OR Context Type OR Context Id',
          'NOT_FOUND',
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
      .where('form.context = :context', { context: whereClause.context });

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
                    Object.values(obj).forEach(value => {
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
                    await this.fieldsService.archiveFieldsByIds(uniqueFieldIds, decoded?.sub);
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
}
