import { HttpStatus, Injectable, BadRequestException } from '@nestjs/common';
import { FieldsDto } from 'src/fields/dto/fields.dto';
import { FieldsSearchDto } from 'src/fields/dto/fields-search.dto';
import { FieldValuesDto } from 'src/fields/dto/field-values.dto';
import { FieldValuesSearchDto } from 'src/fields/dto/field-values-search.dto';
import jwt_decode from 'jwt-decode';
import { ErrorResponse } from 'src/error-response';
import { Fields } from './entities/fields.entity';
import { FieldValues } from './entities/fields-values.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository, getConnection, getRepository } from 'typeorm';
import { SuccessResponse } from 'src/success-response';
import { off } from 'process';
import APIResponse from 'src/utils/response';
import { log } from 'util';
import { ErrorResponseTypeOrm } from 'src/error-response-typeorm';
import { FieldValueConverter } from 'src/utils/field-value-converter';

@Injectable()
export class FieldsService {
  constructor(
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldsValuesRepository: Repository<FieldValues>
  ) {}

  //fields
  async createFields(request: any, fieldsDto: FieldsDto) {
    try {
      const fieldsData: any = {}; // Define an empty object to store field data

      Object.keys(fieldsDto).forEach((e) => {
        if (fieldsDto[e] && fieldsDto[e] !== '') {
          if (e === 'render') {
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
        message: 'Ok.',
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
    fieldsSearchDto: FieldsSearchDto
  ) {
    try {
      const getConditionalData = APIResponse.search(fieldsSearchDto);
      const offset = getConditionalData.offset;
      const limit = getConditionalData.limit;
      const whereClause = getConditionalData.whereClause;

      const getFieldValue = await this.searchFieldData(
        offset,
        limit,
        whereClause
      );

      return new SuccessResponse({
        statusCode: HttpStatus.OK,
        message: 'Ok.',
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

    const [results, totalCount] = await this.fieldsRepository.findAndCount(
      queryOptions
    );

    const mappedResponse = await this.mappedResponseField(results);
    return { mappedResponse, totalCount };
  }

  /**
   * Creates field values with type-specific storage based on field type
   * @param request - The incoming request object
   * @param fieldValuesDto - The field values data transfer object
   * @returns Success response with created field values or error response
   */
  async createFieldValues(request: any, fieldValuesDto: FieldValuesDto) {
    try {
      // Get field type from Fields table
      const fieldDetails = await this.fieldsRepository.findOne({
        where: { fieldId: fieldValuesDto.fieldId },
      });

      if (!fieldDetails) {
        throw new Error('Field not found');
      }

      try {
        // Use the utility to prepare field data
        const fieldData = FieldValueConverter.prepareFieldData(
          fieldValuesDto.fieldId,
          fieldValuesDto.value,
          fieldValuesDto.itemId,
          fieldDetails.type
        );

        // Set other common fields if provided
        if (fieldValuesDto.createdBy) {
          fieldData.createdBy = fieldValuesDto.createdBy;
        }
        if (fieldValuesDto.updatedBy) {
          fieldData.updatedBy = fieldValuesDto.updatedBy;
        }

        const result = await this.fieldsValuesRepository
          .createQueryBuilder()
          .insert()
          .into('FieldValues')
          .values(fieldData)
          .execute();

        return new SuccessResponse({
          statusCode: HttpStatus.CREATED,
          message: 'Ok.',
          data: result.raw[0],
        });
      } catch (error) {
        throw new BadRequestException(error.message);
      }
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  async searchFieldValues(
    request: any,
    fieldValuesSearchDto: FieldValuesSearchDto
  ) {
    try {
      const getConditionalData = APIResponse.search(fieldValuesSearchDto);
      const offset = getConditionalData.offset;
      const limit = getConditionalData.limit;
      const whereClause = getConditionalData.whereClause;

      const getFieldValue = await this.getSearchFieldValueData(
        offset,
        limit,
        whereClause
      );

      return new SuccessResponse({
        statusCode: HttpStatus.OK,
        message: 'Ok.',
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
    searchData: any
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

  /**
   * Updates field values with type-specific storage based on field type
   * @param id - The ID of the field value to update
   * @param fieldValuesDto - The field values data transfer object
   * @returns Success response with updated field values or error response
   */
  async updateFieldValues(id: string, fieldValuesDto: FieldValuesDto) {
    try {
      // Get field type from Fields table
      const existingFieldValue = await this.fieldsValuesRepository.findOne({
        where: { fieldValuesId: id },
      });

      if (!existingFieldValue) {
        throw new Error('Field value not found');
      }

      const fieldDetails = await this.fieldsRepository.findOne({
        where: { fieldId: existingFieldValue.fieldId },
      });

      if (!fieldDetails) {
        throw new Error('Field not found');
      }

      // Store the original value if provided
      if (fieldValuesDto.value !== undefined) {
        try {
          // Use the utility to prepare field data
          const fieldData = FieldValueConverter.prepareFieldData(
            existingFieldValue.fieldId,
            fieldValuesDto.value,
            existingFieldValue.itemId,
            fieldDetails.type
          );

          // Set other common fields if provided
          if (fieldValuesDto.updatedBy) {
            fieldData.updatedBy = fieldValuesDto.updatedBy;
          }

          const result = await this.fieldsValuesRepository
            .createQueryBuilder()
            .update('FieldValues')
            .set(fieldData)
            .where('fieldValuesId = :id', { id })
            .execute();

          if (result.affected === 0) {
            throw new Error('No record was updated');
          }

          return new SuccessResponse({
            statusCode: HttpStatus.OK,
            message: 'Updated successfully.',
            data: await this.fieldsValuesRepository.findOne({
              where: { fieldValuesId: id },
            }),
          });
        } catch (error) {
          throw new BadRequestException(error.message);
        }
      }
    } catch (e) {
      return new ErrorResponseTypeOrm({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorMessage: e,
      });
    }
  }

  public async getFieldsAndFieldsValues(itemId: string) {
    const query = `
      SELECT 
        FV."fieldValuesId",
        FV."value",
        FV."textValue",
        FV."numberValue",
        FV."calendarValue",
        FV."dropdownValue",
        FV."radioValue",
        FV."checkboxValue",
        FV."textareaValue",
        FV."itemId", 
        FV."fieldId",
        F."name" AS fieldname,
        F."label",
        F."context",
        F."type",
        F."state",
        F."contextType",
        F."fieldParams"
      FROM public."FieldValues" FV 
      LEFT JOIN public."Fields" F ON FV."fieldId" = F."fieldId" 
      WHERE FV."itemId" = $1`;

    const results = await this.fieldsValuesRepository.query(query, [itemId]);

    // Transform results to use typed values with fallback to generic value
    return results.map(result => {
      let typedValue;
      switch (result.type) {
        case 'text':
          typedValue = result.textValue || result.value;
          break;
        case 'numeric':
          typedValue = result.numberValue || result.value;
          break;
        case 'calendar':
          typedValue = result.calendarValue || result.value;
          break;
        case 'drop_down':
          typedValue = result.dropdownValue || result.value;
          break;
        case 'radio':
          typedValue = result.radioValue || result.value;
          break;
        case 'checkbox':
          typedValue = result.checkboxValue || result.value;
          break;
        case 'textarea':
          typedValue = result.textareaValue || result.value;
          break;
        default:
          typedValue = result.value;
      }

      return {
        fieldValuesId: result.fieldValuesId,
        fieldId: result.fieldId,
        fieldname: result.fieldname,
        label: result.label,
        type: result.type,
        value: typedValue,
        context: result.context,
        state: result.state,
        contextType: result.contextType,
        fieldParams: result.fieldParams
      };
    });
  }

  public async mappedResponse(result: any) {
    const fieldValueResponse = result.map((item: any) => {
      // Use the utility to extract the appropriate value
      const value = item.type ? 
        FieldValueConverter.extractValue(item, item.type) : 
        item.value;

      const fieldValueMapping = {
        value: value ? `${value}` : '',
        fieldValuesId: item?.fieldValuesId ? `${item.fieldValuesId}` : '',
        itemId: item?.itemId ? `${item.itemId}` : '',
        fieldId: item?.fieldId ? `${item.fieldId}` : '',
        createdAt: item?.createdAt ? `${item.createdAt}` : '',
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : '',
        createdBy: item?.createdBy ? `${item.createdBy}` : '',
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : '',
      };

      return new FieldValuesDto(fieldValueMapping);
    });

    return fieldValueResponse;
  }

  public async mappedResponseField(result: any) {
    const fieldResponse = result.map((item: any) => {
      // Use the utility to extract the appropriate value
      const value = item.type ? 
        FieldValueConverter.extractValue(item, item.type) : 
        item.value;

      const fieldMapping = {
        fieldId: item?.fieldId ? `${item.fieldId}` : '',
        assetId: item?.assetId ? `${item.assetId}` : '',
        context: item?.context ? `${item.context}` : '',
        groupId: item?.groupId ? `${item.groupId}` : '',
        name: item?.name ? `${item.name}` : '',
        label: item?.label ? `${item.label}` : '',
        defaultValue: item?.defaultValue ? `${item.defaultValue}` : '',
        type: item?.type ? `${item.type}` : '',
        note: item?.note ? `${item.note}` : '',
        description: item?.description ? `${item.description}` : '',
        state: item?.state ? `${item.state}` : '',
        required: item?.required ? `${item.required}` : '',
        ordering: item?.ordering ? `${item.ordering}` : '',
        metadata: item?.metadata ? `${item.metadata}` : '',
        access: item?.access ? `${item.access}` : '',
        onlyUseInSubform: item?.onlyUseInSubform
          ? `${item.onlyUseInSubform}`
          : '',
        tenantId: item?.tenantId ? `${item.tenantId}` : '',
        createdAt: item?.createdAt ? `${item.createdAt}` : '',
        updatedAt: item?.updatedAt ? `${item.updatedAt}` : '',
        createdBy: item?.createdBy ? `${item.createdBy}` : '',
        updatedBy: item?.updatedBy ? `${item.updatedBy}` : '',
        contextId: item?.contextId ? `${item.contextId}` : '',
        render: item?.render ? `${item.render}` : '',
        contextType: item?.contextType ? `${item.contextType}` : '',
        fieldParams: item?.fieldParams ? JSON.stringify(item.fieldParams) : '',
        value: value ? `${value}` : '', // Add the processed value to the response
      };

      return new FieldsDto(fieldMapping);
    });

    return fieldResponse;
  }
}
