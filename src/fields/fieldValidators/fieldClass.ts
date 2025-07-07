export interface Option {
  name: string;
  order: string;
  value: string;
}

export interface FieldAttributes {
  // [key: string]: any;
  isRequired: boolean;
  isEditable: boolean;
  isHidden?: boolean;
  isPIIField?: boolean;
  isMultiSelect?: boolean;
  maxSelections?: number;
}

export interface FieldParams {
  options: Option[];

  // For calendar
  minDate?: string; // e.g., "16Y"
  maxDate?: string; // e.g., "2025-12-31"
  showTime?: boolean;
  allowedTypes?: string[];
  maxSize?: number;
}

export interface SchemaField {
  label: string;
  name: string;
  type: string;
  isRequired: boolean;
  isEditable: boolean;
  isHidden?: boolean;
  isPIIField: boolean;
  placeholder?: string;
  validation: string[];
  options?: Option[];
  isMultiSelect?: boolean;
  maxSelections?: number;
  hint?: string;
  pattern?: string;
  maxLength?: number;
  minLength?: number;
  fieldId?: string;
  dependsOn?: boolean;
  minDate?: string; // e.g., "16Y"
  maxDate?: string; // e.g., "2025-12-31"
  showTime?: boolean;
}

export interface Option {
  label: string;
  value: string;
}

export abstract class Field {
  constructor(
    protected fieldAttributes: FieldAttributes,
    protected fieldParams?: FieldParams
  ) {}

  abstract validate(value: any): boolean;
}
