import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { SuccessResponse } from "src/success-response";
import { ErrorResponse } from "src/error-response";
const resolvePath = require("object-resolve-path");
import { FieldsDto } from "src/fields/dto/fields.dto";
import { FieldsSearchDto } from "src/fields/dto/fields-search.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { FieldValuesSearchDto } from "src/fields/dto/field-values-search.dto";
import { IServicelocatorfields } from "../fieldsservicelocator";
import { UserDto } from "src/user/dto/user.dto";
export const HasuraFieldsToken = "HasuraFields";
import { FieldsService } from "./services/fields.service";

@Injectable()
export class HasuraFieldsService implements IServicelocatorfields {
  constructor(
    private httpService: HttpService,
    private fieldsService: FieldsService
  ) { }
  getFormCustomField(requiredData: any, response: any) {
    throw new Error("Method not implemented.");
  }

  //fields
  public async createFields(request: any, fieldsDto: FieldsDto) {
    const response = await this.fieldsService.createFields(request, fieldsDto);
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      const result = response.data.data.insert_Fields_one;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: result,
      });
    }
  }

  public async getFields(tenantId: string, fieldsId: any, request: any) {
    const response = await this.fieldsService.getFields(tenantId, fieldsId);
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      let result = response?.data?.data?.Fields;
      const fieldsResponse = await this.mappedResponse(result);
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: fieldsResponse[0],
      });
    }
  }

  public async searchFields(
    tenantId: string,
    request: any,
    fieldsSearchDto: FieldsSearchDto
  ) {
    const response = await this.fieldsService.searchFields(
      request,
      tenantId,
      fieldsSearchDto
    );
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      let result = response.data.data.Fields;
      const fieldsResponse = await this.mappedResponse(result);
      const count = fieldsResponse.length;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        totalCount: count,
        data: fieldsResponse,
      });
    }
  }

  public async updateFields(
    fieldsId: string,
    request: any,
    fieldsDto: FieldsDto
  ) {
    const response = await this.fieldsService.updateFields(fieldsId, fieldsDto);
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      const result = response.data.data;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: result,
      });
    }
  }

  //field values
  public async createFieldValues(request: any, fieldValuesDto: FieldValuesDto) {
    const response = await this.fieldsService.createFieldValues(request, fieldValuesDto);
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      const result = response.data.data.insert_FieldValues_one;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: result,
      });
    }
  }

  public async getFieldValues(id: any, request: any) {
    const response = await this.fieldsService.getFieldValues(id);
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      let result = response?.data?.data?.FieldValues;
      const fieldsResponse = await this.mappedResponseValues(result);
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: fieldsResponse[0],
      });
    }
  }

  public async searchFieldValues(
    request: any,
    fieldValuesSearchDto: FieldValuesSearchDto
  ) {
    const response = await this.fieldsService.searchFieldValues(
      request,
      fieldValuesSearchDto
    );
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      let result = response.data.data.FieldValues;
      const fieldValuesResponse = await this.mappedResponseValues(result);
      const count = fieldValuesResponse.length;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        totalCount: count,
        data: fieldValuesResponse,
      });
    }
  }

  public async updateFieldValues(
    id: string,
    request: any,
    fieldValuesDto: FieldValuesDto
  ) {
    const response = await this.fieldsService.updateFieldValues(
      id,
      fieldValuesDto
    );
    if (response?.data?.errors) {
      return new ErrorResponse({
        errorCode: response?.data?.errors[0]?.extensions?.code,
        errorMessage: response?.data?.errors[0]?.message,
      });
    } else {
      const result = response.data.data;
      return new SuccessResponse({
        statusCode: 200,
        message: "Ok.",
        data: result,
      });
    }
  }

  public async mappedResponse(result: any) {
    const fieldsResponse = result.map((item: any) => {
      const fieldsMapping = {
        tenantId: item?.tenantId ? `${item.tenantId}` : "",
        fieldId: item?.fieldId ? `${item.fieldId}` : "",
        assetId: item?.assetId ? `${item.assetId}` : "",
        context: item?.context ? `${item.context}` : "",
        contextId: item?.contextId ? `${item.contextId}` : "",
        render: item?.render ? `${item.render}` : "",
        groupId: item?.groupId ? `${item.groupId}` : "",
        name: item?.name ? `${item.name}` : "",
        label: item?.label ? `${item.label}` : "",
        defaultValue: item?.defaultValue ? `${item.defaultValue}` : "",
        type: item?.type ? `${item.type}` : "",
        note: item?.note ? `${item.note}` : "",
        description: item?.description ? `${item.description}` : "",
        state: item?.state ? `${item.state}` : "",
        required: item?.required ? item.required : null,
        ordering: item?.ordering ? item.ordering : null,
        metadata: item?.metadata ? `${item.metadata}` : "",
        access: item?.access ? `${item.access}` : "",
        onlyUseInSubform: item?.onlyUseInSubform ? item.onlyUseInSubform : null,
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
      };
      return new FieldsDto(fieldsMapping);
    });

    return fieldsResponse;
  }
  public async mappedResponseValues(result: any) {
    const fieldValuesResponse = result.map((item: any) => {
      const fieldValuesMapping = {
        value: item?.value ? `${item.value}` : "",
        fieldValuesId: item?.fieldValuesId ? `${item.fieldValuesId}` : "",
        itemId: item?.itemId ? `${item.itemId}` : "",
        fieldId: item?.fieldId ? `${item.fieldId}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
      };
      return new FieldValuesDto(fieldValuesMapping);
    });

    return fieldValuesResponse;
  }

  public async getFieldOptions() { }
}
