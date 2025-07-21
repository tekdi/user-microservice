import { HttpStatus, Injectable } from "@nestjs/common";
import { FieldsDto } from "src/fields/dto/fields.dto";
import { FieldsSearchDto } from "src/fields/dto/fields-search.dto";
import { FieldValuesDto } from "src/fields/dto/field-values.dto";
import { FieldValuesSearchDto } from "src/fields/dto/field-values-search.dto";
import { ErrorResponse } from "src/error-response";
import { Fields } from "./entities/fields.entity";
import { FieldValues } from "./entities/fields-values.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository, getConnection, getRepository } from "typeorm";
import { SuccessResponse } from "src/success-response";
import { off } from "process";
import APIResponse from "src/utils/response";
import { log } from "util";
import { ErrorResponseTypeOrm } from "src/error-response-typeorm";

@Injectable()
export class FieldsService {
  constructor(
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldsValuesRepository: Repository<FieldValues>,
  ) {}

  //fields
  async createFields(request: any, fieldsDto: FieldsDto) {
    try {
      const fieldsData: any = {}; // Define an empty object to store field data

      Object.keys(fieldsDto).forEach((e) => {
        if (fieldsDto[e] && fieldsDto[e] !== "") {
          if (e === "render") {
            fieldsData[e] = fieldsDto[e];
          } else if (Array.isArray(fieldsDto[e])) {
            fieldsData[e] = JSON.stringify(fieldsDto[e]);
          } else {
            fieldsData[e] = fieldsDto[e];
          }
        }
      });

      const result = await this.fieldsRepository.save(fieldsData);
      return new SuccessResponse({
        statusCode: HttpStatus.CREATED,
        message: "Ok.",
        data: result,
      });
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  async searchFields(
    tenantId: string,
    request: any,
    fieldsSearchDto: FieldsSearchDto,
  ) {
    try {
      const getConditionalData = APIResponse.search(fieldsSearchDto);
      const offset = getConditionalData.offset;
      const limit = getConditionalData.limit;
      const whereClause = getConditionalData.whereClause;

      const getFieldValue = await this.searchFieldData(
        offset,
        limit,
        whereClause,
      );

      return new SuccessResponse({
        statusCode: HttpStatus.OK,
        message: "Ok.",
        totalCount: getFieldValue.totalCount,
        data: getFieldValue.mappedResponse,
      });
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  async searchFieldData(offset: number, limit: string, searchData: any) {
    const queryOptions: any = {
      where: searchData,
    };

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (limit !== undefined) {
      queryOptions.take = parseInt(limit);
    }

    const [results, totalCount] =
      await this.fieldsRepository.findAndCount(queryOptions);

    const mappedResponse = await this.mappedResponseField(results);
    return { mappedResponse, totalCount };
  }

  async createFieldValues(request: any, fieldValuesDto: FieldValuesDto) {
    try {
      const fieldsData: any = {};
      Object.keys(fieldValuesDto).forEach((e) => {
        if (fieldValuesDto[e] && fieldValuesDto[e] != "") {
          if (Array.isArray(fieldValuesDto[e])) {
            fieldsData[e] = JSON.stringify(fieldValuesDto[e]);
          } else {
            fieldsData[e] = fieldValuesDto[e];
          }
        }
      });

      const result = await this.fieldsValuesRepository.save(fieldsData);
      return new SuccessResponse({
        statusCode: HttpStatus.CREATED,
        message: "Ok.",
        data: result,
      });
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  async searchFieldValues(
    request: any,
    fieldValuesSearchDto: FieldValuesSearchDto,
  ) {
    try {
      const getConditionalData = APIResponse.search(fieldValuesSearchDto);
      const offset = getConditionalData.offset;
      const limit = getConditionalData.limit;
      const whereClause = getConditionalData.whereClause;

      const getFieldValue = await this.getSearchFieldValueData(
        offset,
        limit,
        whereClause,
      );

      return new SuccessResponse({
        statusCode: HttpStatus.OK,
        message: "Ok.",
        totalCount: getFieldValue.totalCount,
        data: getFieldValue.mappedResponse,
      });
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  async getSearchFieldValueData(
    offset: number,
    limit: string,
    searchData: any,
  ) {
    const queryOptions: any = {
      where: searchData,
    };

    if (offset !== undefined) {
      queryOptions.skip = offset;
    }

    if (limit !== undefined) {
      queryOptions.take = parseInt(limit);
    }

    const [results, totalCount] =
      await this.fieldsValuesRepository.findAndCount(queryOptions);
    const mappedResponse = await this.mappedResponse(results);

    return { mappedResponse, totalCount };
  }

  async searchFieldValueId(cohortId: string, fieldId: string) {
    const response = await this.fieldsValuesRepository.findOne({
      where: { itemId: cohortId, fieldId: fieldId },
    });
    return response;
  }

  async updateFieldValues(id: string, fieldValuesDto: FieldValuesDto) {
    try {
      const fieldsData: any = {};
      Object.keys(fieldValuesDto).forEach((e) => {
        if (fieldValuesDto[e] && fieldValuesDto[e] != "") {
          if (Array.isArray(fieldValuesDto[e])) {
            fieldsData[e] = JSON.stringify(fieldValuesDto[e]);
          } else {
            fieldsData[e] = fieldValuesDto[e];
          }
        }
      });
      const response = await this.fieldsValuesRepository.update(
        id,
        fieldValuesDto,
      );

      return response;
    } catch (e) {
      return new ErrorResponse({
        errorCode: "400",
        errorMessage: e,
      });
    }
  }

  public async getFieldsAndFieldsValues(cohortId: string) {
    const query = `SELECT FV."value",FV."itemId", FV."fieldId", F."name" AS fieldname, F."label", F."context",F."type", F."state", F."contextType", F."fieldParams" FROM public."FieldValues" FV 
        LEFT JOIN public."Fields" F
        ON FV."fieldId" = F."fieldId" where FV."itemId" =$1`;
    const results = await this.fieldsValuesRepository.query(query, [cohortId]);
    return results;
  }

  public async mappedResponse(result: any) {
    const fieldValueResponse = result.map((item: any) => {
      const fieldValueMapping = {
        value: item?.value ? `${item.value}` : "",
        fieldValuesId: item?.fieldValuesId ? `${item.fieldValuesId}` : "",
        itemId: item?.itemId ? `${item.itemId}` : "",
        fieldId: item?.fieldId ? `${item.fieldId}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
      };

      return new FieldValuesDto(fieldValueMapping);
    });

    return fieldValueResponse;
  }

  public async mappedResponseField(result: any) {
    const fieldResponse = result.map((item: any) => {
      const fieldMapping = {
        fieldId: item?.fieldId ? `${item.fieldId}` : "",
        assetId: item?.assetId ? `${item.assetId}` : "",
        context: item?.context ? `${item.context}` : "",
        groupId: item?.groupId ? `${item.groupId}` : "",
        name: item?.name ? `${item.name}` : "",
        label: item?.label ? `${item.label}` : "",
        defaultValue: item?.defaultValue ? `${item.defaultValue}` : "",
        type: item?.type ? `${item.type}` : "",
        note: item?.note ? `${item.note}` : "",
        description: item?.description ? `${item.description}` : "",
        state: item?.state ? `${item.state}` : "",
        required: item?.required ? `${item.required}` : "",
        ordering: item?.ordering ? `${item.ordering}` : "",
        metadata: item?.metadata ? `${item.metadata}` : "",
        access: item?.access ? `${item.access}` : "",
        onlyUseInSubform: item?.onlyUseInSubform
          ? `${item.onlyUseInSubform}`
          : "",
        tenantId: item?.tenantId ? `${item.tenantId}` : "",
        createdAt: item?.createdAt ? `${item.createdAt}` : "",
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : "",
        createdBy: item?.createdBy ? `${item.createdBy}` : "",
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : "",
        contextId: item?.contextId ? `${item.contextId}` : "",
        render: item?.render ? `${item.render}` : "",
        contextType: item?.contextType ? `${item.contextType}` : "",
        fieldParams: item?.fieldParams ? JSON.stringify(item.fieldParams) : "",
      };

      return new FieldsDto(fieldMapping);
    });

    return fieldResponse;
  }
}
