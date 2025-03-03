import { ConsoleLogger } from "@nestjs/common";

export function validateMultiSelect(value, fieldDetails) {
  const fieldParamsOptions = fieldDetails.fieldParams.options.map(
    ({ value }) => value
  );
  if (fieldDetails.fieldAttributes.isMultiSelect) {
    if (!Array.isArray(value)) {
      throw new Error("Value must be an array for multiple selections.");
    }
    if (
      !(
        fieldDetails.fieldAttributes.maxSelections &&
        value.length <= fieldDetails.fieldAttributes.maxSelections
      )
    ) {
      throw new Error(
        `Maximum selections exceeded. Max: ${fieldDetails.fieldAttributes.maxSelections}`
      );
    }
  
  // value.every((val: any) => {
  //   console.log(fieldParamsOptions,String(val),"Type check")
  //    return fieldParamsOptions.includes(String(val));
  // });
  
  //   if (!value.every((val: any) => fieldParamsOptions.includes(String(val[0])))) {
  //     throw new Error("Invalid option selected.");
  //   }
    return true;
  } else {
    throw new Error("Field not of type multiselect");
  }
}
