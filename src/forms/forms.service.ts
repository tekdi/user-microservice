import { BadRequestException, HttpStatus, Injectable } from "@nestjs/common";
import jwt_decode from "jwt-decode";
import { InjectRepository } from "@nestjs/typeorm";
import { Form } from "./entities/form.entity";
import { FindOperator, IsNull, Repository } from "typeorm";
import { PostgresFieldsService } from "../adapters/postgres/fields-adapter";
import APIResponse from "src/common/responses/response";
import { CohortContextType } from "./utils/form-class";
import { FormCreateDto } from "./dto/form-create.dto";
import { APIID } from "@utils/api-id.config";
import { API_RESPONSES } from "@utils/response.messages";
import { FormUpdateDto } from "./dto/form-update.dto";

@Injectable()
export class FormsService {
  constructor(
    private readonly fieldsService: PostgresFieldsService,
    @InjectRepository(Form)
    private readonly formRepository: Repository<Form>
  ) { }

  async getForm(requiredData, response) {
    let apiId = APIID.FORM_GET;
    try {  
      const { context, contextType, tenantId } = requiredData;
  
      // Validate input
      const validationResult = await this.validateFormInput(requiredData);
  
      if (validationResult.error) {
        return APIResponse.error(
          response,
          apiId,
          "BAD_REQUEST",
          validationResult.error,
          HttpStatus.BAD_REQUEST
        );
      }
  
      // Construct the query dynamically, avoiding undefined values
      const query: any = {};
  
      if (context !== undefined) {
        query.context = context;
      } else {
        query.context = IsNull();
      }
  
      if (contextType !== undefined) {
        query.contextType = contextType;
      } else {
        query.contextType = IsNull();
      }
  
      if (tenantId !== undefined && tenantId !== null) {
        query.tenantId = tenantId;
      } else {
        query.tenantId = null;
      }
    
      // Fetch form data using query
      const formData = await this.getFormData(query);
  
      if (!formData) {
        return APIResponse.error(
          response,
          apiId,
          "NOT_FOUND",
          "No Data found for this context OR Context Type",
          HttpStatus.NOT_FOUND
        );
      }
  
      // Process the fields
      const mappedResponse = await Promise.all(
        formData.fields.result.map(async (data) => {
          if (!data.coreField) {
            const whereClause = `"fieldId" = '${data.fieldId}'`;
            const [customFieldData] = await this.fieldsService.getFieldData(whereClause);
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
        "Fields fetched successfully."
      );
    } catch (error) {
      return APIResponse.error(
        response,
        apiId,
        "INTERNAL_SERVER_ERROR",
        error.message || "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  


  async getFormData(whereClause): Promise<any> {
    let query = this.formRepository
      .createQueryBuilder("form")
      .select(["form.formid", "form.title", "form.fields"]);
        
    // Handle context conditionally
    if (whereClause.context instanceof FindOperator && whereClause.context._type === 'isNull') {
      query = query.andWhere("form.context IS NULL");
    } else if (whereClause.context !== undefined) {
      query = query.andWhere("form.context = :context", { context: whereClause.context });
    } else {
      query = query.andWhere("form.context IS NULL OR form.context = :context", { context: whereClause.context });
    }
  
    // Handle contextType conditionally
    if (whereClause.contextType instanceof FindOperator && whereClause.contextType._type === 'isNull') {
      query = query.andWhere("form.contextType IS NULL");
    } else if (whereClause.contextType !== undefined) {
      query = query.andWhere("form.contextType = :contextType", { contextType: whereClause.contextType });
    } else {
      query = query.andWhere("form.contextType IS NULL OR form.contextType = :contextType", { contextType: whereClause.contextType });
    }
  
    // Handle tenantId conditionally
    if (whereClause.tenantId === null) {
      query = query.andWhere("form.tenantId IS NULL");
    } else if (whereClause.tenantId !== undefined) {
      query = query.andWhere("form.tenantId = :tenantId", { tenantId: whereClause.tenantId });
    } else {
      query = query.andWhere("form.tenantId IS NULL OR form.tenantId = :tenantId", { tenantId: whereClause.tenantId });
    }
  
    // Get the full query and parameters
    const [fullQuery, parameters] = query.getQueryAndParameters();
  
    // Execute and return the result
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
    const allowedKeys = ["context", "contextType", "userId"];
    const extraKeys = Object.keys(requiredData).filter(
      (key) => !allowedKeys.includes(key)
    );

    if (extraKeys.length > 0) {
      return {
        error: `Invalid keys provided: ${extraKeys.join(
          ", "
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
            ", "
          )}`,
        };
      }
    }

    return { error: null };
  }


  private async getValidContextTypes(context: string): Promise<string[]> {
    switch (context.toLowerCase()) {
      case "users":
        return await this.getUserContextTypesFromDB();
      case "cohorts":
        return Object.values(CohortContextType);
      case "cohortmember":
        return ["COHORTMEMBER"];
      case "tenant":
        return ["TENANT"];
      default:
        return [];
    }
  }

  public async updateForm(formId: string, request, formUpdateDto: FormUpdateDto, response) {
    const apiId = APIID.FORM_UPDATE;

    try {
      const form = await this.formRepository.findOneBy({ formid: formId });
      if (!form) {
        return APIResponse.error(
          response,
          apiId,
          "NOT_FOUND",
          API_RESPONSES.FORM_NOT_FOUND,
          HttpStatus.NOT_FOUND
        );
      }
      

      // Update properties only if provided
      form.title = formUpdateDto.title?.toUpperCase() || form.title;
      
      if ('context' in formUpdateDto) {
        form.context = formUpdateDto.context ? formUpdateDto.context.toUpperCase() : null;
      }
      if ('contextType' in formUpdateDto) {
        form.contextType = formUpdateDto.contextType ? formUpdateDto.contextType.toUpperCase() : null;
      }
      if ('tenantId' in formUpdateDto) {
        form.tenantId = formUpdateDto.tenantId ? formUpdateDto.tenantId : null;
      }

      form.fields = formUpdateDto.fields || form.fields;

      // Save the updated form
      const result = await this.formRepository.update(formId,form);

      if(result.affected === 1){
        return APIResponse.success(
          response,
          apiId,
          form,
          HttpStatus.OK,
          API_RESPONSES.FORM_UPDATED_SUCCESSFULLY
        );
      }
  
    } catch (error) {
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "INTERNAL_SERVER_ERROR",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


  public async createForm(request, formCreateDto: FormCreateDto, response) {
    let apiId = APIID.FORM_CREATE;

    try {
      const decoded: any = jwt_decode(request.headers.authorization);
      formCreateDto.createdBy = decoded?.sub;
      formCreateDto.updatedBy = decoded?.sub;

      if (formCreateDto.contextType) {
        formCreateDto.contextType = formCreateDto.contextType.toUpperCase();
      }
      if (formCreateDto.contextType) {
        formCreateDto.context = formCreateDto.context.toUpperCase();
      }

      formCreateDto.title = formCreateDto.title.toUpperCase();

      formCreateDto.tenantId = formCreateDto.tenantId.trim().length
        ? formCreateDto.tenantId
        : null;
        
      const checkFormExists = await this.getFormDetail(
        formCreateDto.context,
        formCreateDto.contextType,
        formCreateDto.tenantId,
      );
      
      if (checkFormExists.length) {        
        return APIResponse.error(
          response,
          apiId,
          "BAD_REQUEST",
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
          "BAD_REQUEST",
          API_RESPONSES.INVALID_FORM,
          HttpStatus.BAD_REQUEST
        );
      }

      if (formCreateDto.context) {
        const validContextTypes = await this.getValidContextTypes(
          formCreateDto.context
        );

        if (validContextTypes.length === 0) {
          return APIResponse.error(
            response,
            apiId,
            "BAD_REQUEST",
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
            "BAD_REQUEST",
            API_RESPONSES.INVALID_CONTEXTTYPE(
              formCreateDto.context,
              validContextTypes.join(", ")
            ),
            HttpStatus.BAD_REQUEST
          );
        }
      }
      formCreateDto.context = formCreateDto.context ? formCreateDto.context : null;
      formCreateDto.contextType = formCreateDto.contextType ? formCreateDto.contextType : null;
      formCreateDto.tenantId = formCreateDto.tenantId ? formCreateDto.tenantId : null;

      const result = await this.formRepository.save(formCreateDto);

      return APIResponse.success(
        response,
        apiId,
        result,
        HttpStatus.OK,
        API_RESPONSES.FORM_CREATED_SUCCESSFULLY
      );
    } catch (error) {
      const errorMessage = error.message || "Internal server error";
      return APIResponse.error(
        response,
        apiId,
        "INTERNAL_SERVER_ERROR",
        errorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async validateFormFields(formFields) {
    const fieldIds = [];
    if (Array.isArray(formFields)) {
      for (const element of formFields) {
        if (element["coreField"] === 0 && element["fieldId"]?.trim().length) {
          fieldIds.push(element["fieldId"]);
        } else if (
          (element["coreField"] === 0 && !element["fieldId"]) ||
          (element["coreField"] === 1 && element["fieldId"] !== null)
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

  async getFormDetail(context: string, contextType: string, tenantId: string) {    
    return await this.formRepository.find({
      where: {
        context: context || IsNull(),
        contextType: contextType || IsNull(),
        tenantId: tenantId || null,
      },
    });
  }
}
