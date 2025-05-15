import {
  CheckboxField,
  DropdownField,
  NumericField,
  RadioField,
  TextField,
  CalendarField,
  TextAreaField,
} from './fieldTypeClasses';
import { FieldAttributes, FieldParams, Field } from './fieldClass';
export class FieldFactory {
  static createField(
    type: string,
    fieldAttributes: FieldAttributes,
    fieldParams: FieldParams
  ): Field {
    switch (type) {
      case 'drop_down':
        return new DropdownField(fieldAttributes, fieldParams);
      case 'checkbox':
        return new CheckboxField(fieldAttributes, fieldParams);
      case 'radio':
        return new RadioField(fieldAttributes, fieldParams);
      case 'text':
        return new TextField(fieldAttributes);
      case 'numeric':
        return new NumericField(fieldAttributes);
      case 'textarea':
        return new TextAreaField(fieldAttributes, fieldParams);
      case 'calendar':
        return new CalendarField(fieldAttributes, fieldParams);
      default:
        throw new Error(`Unsupported field type: ${type}`);
    }
  }
}
