import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Form } from './entities/form.entity';
import { Repository } from 'typeorm';
import { PostgresFieldsService } from '../adapters/postgres/fields-adapter';
import APIResponse from "src/common/responses/response";
import { CohortContextType } from './utils/form-class';



@Injectable()
export class FormsService {

  constructor(
  private readonly fieldsService: PostgresFieldsService,
  @InjectRepository(Form)
  private readonly formRepository: Repository<Form>
 ){}

 async getForm(requiredData, response) {
  let apiId = "getFormData";
  try {
    const { context, contextType, tenantId } = requiredData;
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

    const query = { context, contextType };
    if (tenantId) {
      query['tenantId'] = tenantId;
    }
    let data = await this.checkValidUserContextType();
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
    //Fetch Data From Fields Table
    const mappedResponse = await Promise.all(formData.fields.result.map(async data => {
      if (!data.coreField) {
        const whereClause = `"fieldId" = '${data.fieldId}'`;
        const [customFieldData] = await this.fieldsService.getFieldData(whereClause);
        delete customFieldData.sourceDetails;
        customFieldData.order = data.order;
        return customFieldData;
      }
      return data;
    }));

    let result = {formid:formData.formid,title:formData.title,fields:mappedResponse};

    return APIResponse.success(
      response,
      apiId,
      result,
      HttpStatus.OK,
      "Fields fetched successfully."
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


  async getFormData(whereClause):Promise<any>{
     return await this.formRepository.findOne({where: whereClause,select:['formid','title','fields']}) || false;
    }

  async checkValidUserContextType(){
    let query = `select name from "Roles" r`;
    let roleName = await this.formRepository.query(query);
    return roleName;
  }

  private async getUserContextTypesFromDB(): Promise<string[]> {
    const roleNames = await this.checkValidUserContextType();
    return roleNames.map(role => role.name.toUpperCase());
  }

  
  private async validateFormInput(requiredData: any): Promise<{ error: string | null }> {
    delete requiredData.tenantId;
    const allowedKeys = ['context', 'contextType'];
    const extraKeys = Object.keys(requiredData).filter(key => !allowedKeys.includes(key));
    
    if (extraKeys.length > 0) {
      return { error: `Invalid keys provided: ${extraKeys.join(', ')}. Only 'context', 'contextType' is allowed.` };
    }
  
    const { context, contextType } = requiredData;
  
    if (context) {
      const validContextTypes = await this.getValidContextTypes(context);
      if (validContextTypes.length === 0) {
        return { error: `Invalid context: ${context}` };
      }
      if (contextType && !validContextTypes.includes(contextType)) {
        return { error: `Invalid contextType. For the context '${context}', it must be one of: ${validContextTypes.join(', ')}` };
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
      default:
        return [];
    }
  }

}

