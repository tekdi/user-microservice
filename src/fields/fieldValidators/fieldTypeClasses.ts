import { validateMultiSelect } from './field.util';
import { Field, FieldAttributes, FieldParams, Option } from './fieldClass';

export class DropdownField extends Field {
  constructor(fieldAttributes: FieldAttributes, fieldParams: FieldParams) {
    super(fieldAttributes, fieldParams);
  }

  validate(value: any): boolean {
    return validateMultiSelect(value, {
      fieldAttributes: this.fieldAttributes,
      fieldParams: this.fieldParams,
    });
  }

  getOptions(): Option[] {
    return this.fieldParams.options;
  }
}

export class TextField extends Field {
  validate(value: any): boolean {
    if (!(typeof value === 'string')) {
      throw new Error('Value must be string.');
    }
    return true;
  }
}

export class NumericField extends Field {
  validate(value: any): boolean {
    if (!(typeof value === 'string' && this.isNumeric(value))) {
      throw new Error('Value must be numeric.');
    }
    return true;
  }

  isNumeric(input: string) {
    for (let i = 0; i < input.length; i++) {
      if (input[i] < '0' || input[i] > '9') {
        return false;
      }
    }
    return true;
  }
}

export class RadioField extends Field {
  constructor(fieldAttributes: FieldAttributes, fieldParams: FieldParams) {
    super(fieldAttributes, fieldParams);
  }

  validate(value: any): boolean {
    const fieldParamsOptions = this.fieldParams.options.map(
      ({ value }) => value
    );
    if (!fieldParamsOptions.includes(value)) {
      throw new Error('Invalid option selected.');
    }
    return true;
  }

  getOptions(): Option[] {
    return this.fieldParams.options;
  }
}

export class CheckboxField extends Field {
  constructor(fieldAttributes: FieldAttributes, fieldParams: FieldParams) {
    super(fieldAttributes, fieldParams);
  }

  validate(value: any): boolean {
    return validateMultiSelect(value, {
      fieldAttributes: this.fieldAttributes,
      fieldParams: this.fieldParams,
    });
  }

  getOptions(): Option[] {
    return this.fieldParams.options;
  }
}

export class TextAreaField extends Field {
  constructor(fieldAttributes: FieldAttributes) {
    super(fieldAttributes);
  }

  validate(value: any): boolean {
    if (typeof value !== 'string') {
      throw new Error('Value must be a string.');
    }
    return true;
  }
}

export class CalendarField extends Field {
  constructor(fieldAttributes: FieldAttributes) {
    super(fieldAttributes);
  }

  validate(value: any): boolean {
    // Basic date format check (you can improve this as needed)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
    if (!datePattern.test(value)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD.');
    }
    return true;
  }
}
