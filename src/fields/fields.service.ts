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

import { FormsService } from 'src/forms/forms.service';

@Injectable()
export class FieldsService {
  constructor(
    @InjectRepository(Fields)
    private fieldsRepository: Repository<Fields>,
    @InjectRepository(FieldValues)
    private fieldsValuesRepository: Repository<FieldValues>,
    private readonly formsService: FormsService
  ) {}

  async getFieldById(fieldId: string): Promise<Fields | null> {
    return await this.fieldsRepository.findOne({
      where: { fieldId },
    });
  }

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

  /**
   * Process checkbox values based on form schema field type
   * @param fieldId - The field ID to process
   * @param checkboxValue - The checkbox value from database
   * @param formId - The form ID to get schema from
   * @returns Processed value based on field type in schema
   */
  private async processCheckboxValue(
    fieldId: string,
    checkboxValue: string,
    formId: string
  ): Promise<any> {
    try {
      // Step 1: Check if the field type is 'checkbox' in the Fields table
      const fieldFromDB = await this.fieldsRepository.findOne({
        where: { fieldId },
      });

      // Only process if the field type is 'checkbox' in the Fields table
      if (!fieldFromDB || fieldFromDB.type !== 'checkbox') {
        return [checkboxValue];
      }
      // Step 2: Get the form schema from database using formId
      const form = await this.formsService.getFormById(formId);
      const formFields = form?.fields || {};
      // Step 3: Find the field metadata in the form schema
      const fieldMetadata = this.findFieldMetadata(fieldId, formFields);

      // If field not found in schema, return original value
      if (!fieldMetadata) {
        return checkboxValue;
      }
// Step 4: Get field type from schema - check both direct type and schema.type
const fieldType = fieldMetadata.schema?.type || fieldMetadata.type; // Type from schema: "boolean", "string", "array"
      // Step 2: Get enum options from the field's fieldParams in the database
      // This is more reliable than getting from form schema
      const rawOptions = (fieldFromDB.fieldParams as any)?.options;

      const enumOptions: string[] = Array.isArray(rawOptions?.enum)
        ? rawOptions.enum
        : Array.isArray(rawOptions)
        ? rawOptions
        : [];

      // console.log('Field from DB:', fieldFromDB.fieldParams);
      // console.log('Raw options:', rawOptions);
      // console.log('Enum options:', enumOptions);

      const isMultiSelect = enumOptions.length > 0;

      // // Guard against null/undefined
      if (checkboxValue == null) {
        return [checkboxValue];
      }
      // Step 5: Normalize the checkbox value
      // console.log('Input checkboxValue:', checkboxValue, 'Type:', typeof checkboxValue, 'IsArray:', Array.isArray(checkboxValue));

      let normalized;
      if (Array.isArray(checkboxValue)) {
        // If it's an array, check if it contains a single string that needs splitting
        if (
          checkboxValue.length === 1 &&
          typeof checkboxValue[0] === 'string' &&
          checkboxValue[0].includes(',')
        ) {
          // Single string in array that contains commas - treat as string for processing
          // console.log('Array with single comma-separated string, processing:', checkboxValue[0]);
          normalized = checkboxValue[0].trim();
        } else {
          // Multiple elements or single element without commas - return as is
          // console.log('Array without comma-separated string, returning as is:', checkboxValue);
          return checkboxValue;
        }
      } else if (typeof checkboxValue === 'string') {
        // console.log('String input, processing:', checkboxValue);
        normalized = checkboxValue.trim();
      } else {
        // console.log('Other type input, processing:', checkboxValue);
        normalized = checkboxValue;
      }

      // Preserve exact matches even when they contain commas
      if (typeof normalized === 'string' && enumOptions.includes(normalized)) {
        return [normalized];
      }

      // For checkbox fields with comma-separated values, use the enhanced processor
      // For checkbox fields with comma-separated values
      if (typeof normalized === 'string' && normalized.includes(',')) {
        // First, check if the original value exactly matches any enum option
        // This handles single values that contain commas (like "SAT, TOEFL")
        if (enumOptions.some((opt) => opt.trim() === normalized.trim())) {
          return [normalized]; // Return as array for consistency
        }

        let parts: string[] = [];

        // First try splitting on ".," pattern (for options that end with dots)
        if (normalized.includes('.,')) {
          parts = normalized
            .split('.,')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
            .map((v) => (v.endsWith('.') ? v : v + '.'));
        } else {
          // Fallback to regular comma splitting for other patterns
          parts = normalized
            .split(/\s*,\s*/g) // handles ",", ", ", " , "
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
        }

        // Match only those parts that exist in enumOptions
        const matchedValues = parts.filter((p) => {
          const partTrimmed = p.trim();
          // console.log(`Checking part: "${partTrimmed}"`);
          const found = enumOptions.some((opt) => {
            const optTrimmed = opt.trim();
            const isMatch = optTrimmed === partTrimmed;
            // console.log(`  Comparing with: "${optTrimmed}" -> ${isMatch}`);
            return isMatch;
          });

          return found;
        });

        // If we found valid matches, return them as an array
        if (matchedValues.length > 0) {
          return matchedValues;
        }

        // If we have multiple parts but no exact matches, try a more flexible matching approach
        if (parts.length > 1) {
          // Try to find partial matches or similar matches
          const flexibleMatches = parts.filter((p) => {
            return enumOptions.some((opt) => {
              const optTrimmed = opt.trim();
              const partTrimmed = p.trim();
              // Check for exact match or if the part is contained in the option
              return (
                optTrimmed === partTrimmed ||
                optTrimmed.includes(partTrimmed) ||
                partTrimmed.includes(optTrimmed)
              );
            });
          });

          if (flexibleMatches.length > 0) {
            return flexibleMatches;
          }
        }

        // If we have multiple parts but no matches, it might be a case where
        // the string contains multiple valid enum options that need to be split differently
        if (parts.length > 1) {
          // Try to find if any combination of parts forms valid enum options
          // This handles cases like "First year / Freshman,Second year / Sophomore"
          const allValidParts = [];
          for (const part of parts) {
            const partTrimmed = part.trim();
            const foundMatch = enumOptions.find((opt) => {
              const optTrimmed = opt.trim();
              const isMatch = optTrimmed === partTrimmed;
              return isMatch;
            });
            if (foundMatch) {
              allValidParts.push(foundMatch);
            }
          }

          if (allValidParts.length > 0) {
            return allValidParts;
          }
        }

        // If still no match, return the original value as-is
        return [normalized]; // Return as array for consistency
      }

      // Step 6: Handle single value based on field type in schema
      switch (fieldType) {
        case 'boolean': {
          const booleanResult = checkboxValue === 'true' || checkboxValue === '1';
          return booleanResult;
        }
        case 'string':
          return checkboxValue; // Current workflow - return as string
        case 'array':
          return [checkboxValue]; // Even single value as array
        default:
          return checkboxValue; // Current workflow fallback
      }
    } catch (error) {
      return checkboxValue;
    }
  }

  /**
   * Helper function to find field metadata in form schema
   * @param fieldId - The field ID to find
   * @param formFields - The form fields object (jsonb)
   * @returns Field metadata or null if not found
   */
  private findFieldMetadata(fieldId: string, formFields: any): any {
    // Recursively search through the form fields object
    const searchFields = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return null;
      }

      // If this object has a fieldId that matches, return it
      if (obj.fieldId === fieldId) {
        return obj;
      }

      // Recursively search through all object values
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (typeof value === 'object' && value !== null) {
            const result = searchFields(value);
            if (result) {
              return result;
            }
          }
        }
      }

      return null;
    };

    const result = searchFields(formFields);
    return result;
  }

  /**
   * Get fields and field values with optional formId for checkbox processing
   * @param itemId - The item ID to get field values for
   * @param formId - Optional form ID for checkbox processing
   * @returns Array of field values with processed checkbox values
   */
  public async getFieldsAndFieldsValues(itemId: string, formId?: string) {
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
    const processedResults = await Promise.all(
      results.map(async (result) => {
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
            if (formId) {
              // Use new checkbox processing with form schema
              typedValue = await this.processCheckboxValue(
                result.fieldId,
                result.checkboxValue || result.value,
                formId
              );
            } else {
              // Use existing workflow - NO CHANGE to current behavior
              typedValue = result.checkboxValue || result.value;
            }
            break;
          case 'textarea':
            typedValue = result.textareaValue || result.value;
            break;
          default:
            typedValue = result.value;
        }

        const processedResult = {
          fieldValuesId: result.fieldValuesId,
          fieldId: result.fieldId,
          fieldname: result.fieldname,
          label: result.label,
          type: result.type,
          value: typedValue,
          context: result.context,
          state: result.state,
          contextType: result.contextType,
          fieldParams: result.fieldParams,
        };
        return processedResult;
      })
    );
    return processedResults;
  }

  public async mappedResponse(result: any) {
    const fieldValueResponse = result.map((item: any) => {
      // Use the utility to extract the appropriate value
      const value = item.type
        ? FieldValueConverter.extractValue(item, item.type)
        : item.value;

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
      const value = item.type
        ? FieldValueConverter.extractValue(item, item.type)
        : item.value;

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

  async getField(fieldId: string): Promise<Fields> {
    return this.fieldsRepository.findOne({ where: { fieldId } });
  }

  async getFieldValue(fieldId: string, itemId: string): Promise<FieldValues> {
    return this.fieldsValuesRepository.findOne({
      where: { fieldId: fieldId, itemId: itemId },
    });
  }

  async updateFieldValue(data: {
    fieldId: string;
    itemId: string;
    value: string;
    fileValue: string;
  }): Promise<void> {
    await this.fieldsValuesRepository.update(
      { fieldId: data.fieldId, itemId: data.itemId },
      { value: data.value, fileValue: data.fileValue }
    );
  }

  async deleteFieldValue(fieldId: string, itemId: string): Promise<void> {
    await this.fieldsValuesRepository.delete({
      fieldId: fieldId,
      itemId: itemId,
    });
  }
}
