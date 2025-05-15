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

// text area field class
export class TextAreaField extends Field {
  minLength?: number;
  maxLength?: number;

  constructor(fieldAttributes: FieldAttributes, fieldParams?: FieldParams) {
    super(fieldAttributes, fieldParams);
  }

  validate(value: any): boolean {
    if (typeof value !== 'string') return false;
    if (this.minLength && value.length < this.minLength) return false;
    if (this.maxLength && value.length > this.maxLength) return false;
    return true;
  }
}

// calendar field class
export class CalendarField extends Field {
  showTime: boolean;
  minDate?: string;
  maxDate?: string;

  constructor(fieldAttributes: FieldAttributes, fieldParams?: FieldParams) {
    super(fieldAttributes, fieldParams);
    this.showTime = fieldParams?.showTime ?? false;
    this.minDate = fieldParams?.minDate;
    this.maxDate = fieldParams?.maxDate;
  }

  validate(value: any): boolean {
    if (!value) return false;

    // If value is an array, get first item
    if (Array.isArray(value)) value = value[0];

    // Replace space with T if needed
    if (
      typeof value === 'string' &&
      value.includes(' ') &&
      !value.includes('T')
    ) {
      value = value.replace(' ', 'T');
    }

    let date = new Date(value);
    if (isNaN(date.getTime())) return false;

    if (!this.showTime) {
      date.setHours(0, 0, 0, 0);
    }

    if (this.minDate) {
      const min = this.parseDate(this.minDate);
      if (!this.showTime) min.setHours(0, 0, 0, 0);
      if (date < min) return false;
    }

    if (this.maxDate) {
      const max = new Date(this.maxDate);
      if (!this.showTime) max.setHours(0, 0, 0, 0);
      if (date > max) return false;
    }

    return true;
  }

  //formatValue method to format the date value to get date and datetime depending on the showTime property
  formatValue(value: any): string | null {
    if (!value) return null;

    if (Array.isArray(value)) value = value[0];

    // Normalize string (convert to ISO-like format)
    if (
      typeof value === 'string' &&
      value.includes(' ') &&
      !value.includes('T')
    ) {
      value = value.replace(' ', 'T');
    }

    // Truncate microseconds if present
    if (typeof value === 'string') {
      value = value.replace(/(\.\d{3})\d+/, '$1');
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return null;

    if (!this.showTime) {
      // Return only the date portion (YYYY-MM-DD)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Full ISO datetime string
    return date.toISOString();
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
