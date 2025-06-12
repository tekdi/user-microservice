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
        {
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'textValue'
          };
        }
        case 'number':
        {
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            throw new Error(`Invalid number value: ${value}`);
          }
          return {
            value: value?.toString(),
            convertedValue: numValue,
            columnName: 'numberValue'
          };
        }
        case 'calendar':
        {
          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) {
            throw new Error(`Invalid date value: ${value}`);
          }
          return {
            value: value?.toString(),
            convertedValue: dateValue,
            columnName: 'calendarValue'
          };
        }
        case 'drop_down':
        {
          let convertedValue;
          if (Array.isArray(value)) {
            convertedValue = value.join(',');
          } else if (typeof value === 'string') {
            convertedValue = value;
          } else if (value && typeof value === 'object') {
            try {
              const parsedValue = JSON.parse(JSON.stringify(value));
              if (Array.isArray(parsedValue)) {
                convertedValue = parsedValue.join(',');
              } else {
                convertedValue = String(value);
              }
            } catch (e) {
              convertedValue = String(value);
            }
          } else {
            convertedValue = String(value || '');
          }
          
          return {
            value: convertedValue,
            convertedValue: convertedValue,
            columnName: 'dropdownValue'
          };
        }
        case 'radio':
        {
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'radioValue'
          };
        }
        case 'checkbox':
        {
          let convertedValue;
          if (Array.isArray(value)) {
            convertedValue = value.join(',');
          } else if (typeof value === 'string') {
            convertedValue = value;
          } else {
            convertedValue = value?.toString();
          }
          return {
            value: Array.isArray(value) ? value.join(',') : value?.toString(),
            convertedValue: convertedValue,
            columnName: 'checkboxValue'
          };
        }
        case 'textarea':
        {
            return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'textareaValue'
          };
        }
        case 'file':
        {
            return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'fileValue'
          };
        }
        default:
        {
          return {
            value: value?.toString(),
            convertedValue: value?.toString(),
            columnName: 'value'
          };
        }
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
    const conversion = FieldValueConverter.convertValue(value, fieldType);
    
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
    const conversion = FieldValueConverter.convertValue(fieldRecord.value, fieldType);
    const typeSpecificValue = fieldRecord[conversion.columnName];
    
    return typeSpecificValue ?? fieldRecord.value;
  }
} 