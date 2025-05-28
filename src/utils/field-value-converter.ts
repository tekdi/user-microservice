import { BadRequestException } from '@nestjs/common';

export interface FieldValueConversion {
  value: any;           // Original value
  convertedValue: any;  // Type-specific converted value
  columnName: string;   // Database column name for the specific type
}

export class FieldValueConverter {
  /**
   * Converts and validates a field value based on its type
   * @param value The value to convert
   * @param fieldType The type of field (text, number, calendar, etc.)
   * @returns Object containing the converted value and column information
   * @throws BadRequestException if validation fails
   */
  static convertValue(value: any, fieldType: string): FieldValueConversion {
    const type = fieldType?.toLowerCase();
    
    try {
      switch (type) {
        case 'text':
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'textValue'
          };

        case 'number':
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            throw new Error(`Invalid number value: ${value}`);
          }
          return {
            value: value?.toString(),
            convertedValue: numValue,
            columnName: 'numberValue'
          };

        case 'calendar':
          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) {
            throw new Error(`Invalid date value: ${value}`);
          }
          return {
            value: value?.toString(),
            convertedValue: dateValue,
            columnName: 'calendarValue'
          };

        case 'dropdown':
          let dropdownValue;
          if (typeof value === 'string') {
            try {
              dropdownValue = JSON.parse(value);
            } catch (error) {
              throw new Error(`Invalid JSON value for dropdown: ${value}`);
            }
          } else {
            dropdownValue = value;
          }
          return {
            value: value?.toString(),
            convertedValue: dropdownValue,
            columnName: 'dropdownValue'
          };

        case 'radio':
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'radioValue'
          };

        case 'checkbox':
          const boolValue = value === true || value === 'true' || value === '1' || value === 1;
          return {
            value: value?.toString(),
            convertedValue: boolValue,
            columnName: 'checkboxValue'
          };

        case 'textarea':
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'textareaValue'
          };

        case 'file':
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'fileValue'
          };

        default:
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'value'
          };
      }
    } catch (error) {
      throw new BadRequestException(`Field type '${type}' validation failed: ${error.message}`);
    }
  }

  /**
   * Prepares field data for database storage with type-specific values
   * @param fieldId The ID of the field
   * @param value The value to store
   * @param itemId The ID of the item this field belongs to
   * @param fieldType The type of field
   * @returns Object containing all necessary field data for storage
   */
  static prepareFieldData(fieldId: string, value: any, itemId: string, fieldType: string): any {
    const conversion = this.convertValue(value, fieldType);
    
    return {
      fieldId,
      itemId,
      value: conversion.value,
      [conversion.columnName]: conversion.convertedValue
    };
  }

  /**
   * Retrieves the appropriate value from a field record based on its type
   * @param fieldRecord The database record containing all possible value columns
   * @param fieldType The type of field
   * @returns The appropriate value for the field type
   */
  static extractValue(fieldRecord: any, fieldType: string): any {
    const conversion = this.convertValue(fieldRecord.value, fieldType);
    const typeSpecificValue = fieldRecord[conversion.columnName];
    
    return typeSpecificValue ?? fieldRecord.value;
  }
} 