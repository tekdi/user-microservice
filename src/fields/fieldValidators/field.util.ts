export function validateMultiSelect(value, fieldDetails) {
  const fieldParamsOptions = fieldDetails.fieldParams.options.map(
    ({ value }) => value
  );

  // Convert comma-separated string to array if needed
  let valueArray = value;
  if (typeof value === 'string') {
    valueArray = value.split(',').map(v => v.trim()).filter(v => v !== '');
  }

  if (!Array.isArray(valueArray)) {
    throw new Error('Value must be a comma-separated string or array for multiple selections.');
  }

  if (
    fieldDetails.fieldAttributes.maxSelections &&
    valueArray.length > fieldDetails.fieldAttributes.maxSelections
  ) {
    throw new Error(
      `Maximum selections exceeded. Max: ${fieldDetails.fieldAttributes.maxSelections}`
    );
  }

  if (!valueArray.every((val: any) => fieldParamsOptions.includes(val))) {
    throw new Error('Invalid option selected.');
  }

  return true;
}
