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

// export class TextAreaField extends Field {
//   constructor(fieldAttributes: FieldAttributes) {
//     super(fieldAttributes);
//   }

//   validate(value: any): boolean {
//     if (typeof value !== 'string') {
//       throw new Error('Value must be a string.');
//     }
//     return true;
//   }
// }

export class TextAreaField extends Field {
  minLength?: number;
  maxLength?: number;

  constructor(fieldAttributes: FieldAttributes, fieldParams?: FieldParams) {
    super(fieldAttributes, fieldParams);
    // this.minLength = fieldParams?.minLength;
    // this.maxLength = fieldParams?.maxLength;
  }

  validate(value: any): boolean {
    if (typeof value !== 'string') return false;
    if (this.minLength && value.length < this.minLength) return false;
    if (this.maxLength && value.length > this.maxLength) return false;
    return true;
  }
}

// export class CalendarField extends Field {
//   constructor(fieldAttributes: FieldAttributes) {
//     super(fieldAttributes);
//   }

//   validate(value: any): boolean {
//     // Basic date format check (you can improve this as needed)
//     const datePattern = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
//     if (!datePattern.test(value)) {
//       throw new Error('Invalid date format. Expected YYYY-MM-DD.');
//     }
//     return true;
//   }
// }

export class CalendarField extends Field {
  showTime: boolean;
  minDate?: string;
  maxDate?: string;

  constructor(fieldAttributes: FieldAttributes, fieldParams?: FieldParams) {
    super(fieldAttributes, fieldParams);
    // this.showTime = fieldParams?.showTime ?? false;
    // this.minDate = fieldParams?.minDate;
    // this.maxDate = fieldParams?.maxDate;
  }

  validate(value: any): boolean {
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;

    if (this.minDate) {
      const min = this.parseDate(this.minDate);
      if (date < min) return false;
    }

    if (this.maxDate) {
      const max = new Date(this.maxDate);
      if (date > max) return false;
    }

    return true;
  }

  private parseDate(input: string): Date {
    if (input.endsWith('Y')) {
      const years = parseInt(input.replace('Y', ''), 10);
      const date = new Date();
      date.setFullYear(date.getFullYear() - years);
      return date;
    }
    return new Date(input);
  }
}
