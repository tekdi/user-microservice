import { validateMultiSelect } from "./field.util";
import { Field, FieldAttributes, FieldParams, Option } from "./fieldClass";

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
    if (!(typeof value === "string")) {
      throw new Error("Value must be string.");
    }
    return true;
  }
}

export class NumericField extends Field {
  validate(value: any): boolean {
    if (!(typeof value === "string" && this.isNumeric(value))) {
      throw new Error("Value must be numeric.");
    }
    return true;
  }

  isNumeric(input: string) {
    for (let i = 0; i < input.length; i++) {
      if (input[i] < "0" || input[i] > "9") {
        return false;
      }
    }
    return true;
  }
}

export class TimeField extends Field {
    validate(value: any): boolean {
        if (!(typeof value === 'string' && this.isValidTime(value))) {
            throw new Error('Value must be a valid time format (HH:mm or HH:mm:ss).');
        }
        return true;
    }

    isValidTime(input: string): boolean {
        // Regular expression to match HH:mm or HH:mm:ss format
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
        return timeRegex.test(input);
    }
}

export class DateField extends Field {
    validate(value: any): boolean {
        if (typeof value !== 'string' || !this.isValidDate(value)) {
            throw new Error('Value must be a valid date format (YYYY-MM-DD).');
        }
        return true;
    }

    isValidDate(input: string): boolean {
        // Regular expression to match YYYY-MM-DD format
        const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

        // Check if the date matches the format
        if (!dateRegex.test(input)) {
            return false;
        }

        // Additional check for valid month and day combinations (like no February 30th)
        const date = new Date(input);
        return date instanceof Date && !isNaN(date.getTime()) && input === date.toISOString().slice(0, 10);
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
      throw new Error("Invalid option selected.");
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
