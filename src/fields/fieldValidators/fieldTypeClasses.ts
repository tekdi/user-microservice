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

export class FileField extends Field {
  validate(value: any): boolean {
    // Accept both string (single file) and array of strings (multiple files)
    if (typeof value === "string") {
      return true;
    }
    if (Array.isArray(value)) {
      // Validate that all elements in the array are strings
      if (!value.every((item) => typeof item === "string")) {
        throw new Error("All file values must be strings.");
      }
      return true;
    }
    throw new Error("Value must be a string or an array of strings.");
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


export class JsonField extends Field {
  validate(value: any): boolean {
    if (!(typeof value === "object")) {
      throw new Error("Value must be object.");
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
