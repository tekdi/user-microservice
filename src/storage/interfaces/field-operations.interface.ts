export interface IFieldOperations {
  getField(fieldId: string): Promise<any>;
  updateFieldValue(data: {
    fieldId: string;
    itemId: string;
    value: string;
    fileValue: string;
  }): Promise<void>;
} 