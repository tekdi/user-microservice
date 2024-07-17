import { CheckboxField, DropdownField,NumericField,RadioField,TextField } from "./fieldTypeClasses";
import { FieldAttributes, FieldParams, Field } from "./fieldClass";
export class FieldFactory {
    static createField(type: string, fieldAttributes: FieldAttributes, fieldParams: FieldParams): Field {
        switch (type) {
            case 'drop_down':
                return new DropdownField(fieldAttributes,fieldParams);
            case 'checkbox':
                return new CheckboxField(fieldAttributes,fieldParams);
            case 'radio':
                return new RadioField(fieldAttributes,fieldParams);
            case 'text':
                return new TextField(fieldAttributes);
            case 'numeric':
                return new NumericField(fieldAttributes);
            default:
                throw new Error(`Unsupported field type: ${type}`);
        }
    }
}
