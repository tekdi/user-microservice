/**
 * IFieldOperations Interface
 *
 * Defines the contract for field operations used by the file upload service:
 * - Field retrieval and validation
 * - Field value management (create, update, delete)
 * - Database operations for file metadata
 *
 * Implemented by FieldsService to provide database access.
 */
export interface IFieldOperations {
  /**
   * Retrieves a field by its ID.
   * @param fieldId - The field ID to retrieve
   * @returns Promise resolving to the field or null if not found
   */
  getField(fieldId: string): Promise<any>;

  /**
   * Updates a field value in the database.
   * @param data - Object containing fieldId, itemId, value, and fileValue
   * @returns Promise that resolves when update is complete
   */
  updateFieldValue(data: {
    fieldId: string;
    itemId: string;
    value: string;
    fileValue: string;
  }): Promise<void>;

  /**
   * Retrieves a field value by field ID and item ID.
   * @param fieldId - The field ID
   * @param itemId - The item ID (usually user ID)
   * @returns Promise resolving to the field value or null if not found
   */
  getFieldValue(fieldId: string, itemId: string): Promise<any>;

  /**
   * Deletes a field value from the database.
   * @param fieldId - The field ID
   * @param itemId - The item ID (usually user ID)
   * @returns Promise that resolves when deletion is complete
   */
  deleteFieldValue(fieldId: string, itemId: string): Promise<void>;
} 