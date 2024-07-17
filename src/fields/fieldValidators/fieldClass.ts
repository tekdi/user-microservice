export interface Option {
    name: string;
    order: string;
    value: string;
}

export interface FieldAttributes {
    // [key: string]: any;
    isRequired: boolean;
    isEditable: boolean;
    isPIIField?: boolean;
    isMultiSelect?: boolean;
    maxSelections?: number
}

export interface FieldParams {
    options : Option[]
}

export interface SchemaField {
    label: string;
    name: string;
    type: string;
    isRequired: boolean;
    isEditable: boolean;
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
    dependsOn?: boolean
  }
  
  export interface Option {
    label: string;
    value: string;
  }

export abstract class Field {
    constructor(protected fieldAttributes: FieldAttributes,
        protected fieldParams?: FieldParams
    ) {}

    abstract validate(value: any): boolean;
}
