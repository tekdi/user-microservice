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

      const { context, contextType, tenantId } = requiredData;
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

      const formData = await this.getFormData(query);
      if (!formData) {
        return APIResponse.error(
          response,
          apiId,
          'NOT_FOUND',
          'No Data found for this context OR Context Type',
          HttpStatus.NOT_FOUND
        );
      }
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
      .select(['form.formid', 'form.title', 'form.fields'])
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
    const allowedKeys = ['context', 'contextType', 'userId', 'center'];
    const extraKeys = Object.keys(requiredData).filter(
      (key) => !allowedKeys.includes(key)
    );

    if (extraKeys.length > 0) {
      return {
        error: `Invalid keys provided: ${extraKeys.join(
          ', '
        )}. Only 'context', 'contextType' is allowed.`,
      };
    }

    const { context, contextType } = requiredData;

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
      formCreateDto.status =
        formCreateDto.status?.toLowerCase() === 'inactive'
          ? 'inactive'
          : 'active'; // default to 'active'
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
          'BAD_REQUEST',
          API_RESPONSES.FORM_EXISTS,
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
          'BAD_REQUEST',
          API_RESPONSES.INVALID_FORM,
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
          'BAD_REQUEST',
          API_RESPONSES.INVALID_CONTEXT(formCreateDto.context),
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
          'BAD_REQUEST',
          API_RESPONSES.INVALID_CONTEXTTYPE(
            formCreateDto.context,
            validContextTypes.join(', ')
          ),
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
    formUpdateDto: FormCreateDto, // or FormUpdateDto
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
      if (formUpdateDto.status)
        formUpdateDto.status = formUpdateDto.status.toLowerCase();

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
