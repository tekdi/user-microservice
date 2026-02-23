export class StringUtil {
  /**
   * Normalize a string to be used as a key or alias.
   * - Converts to lowercase
   * - Replaces spaces and special characters with underscores
   * - Removes consecutive underscores
   * - Trims leading/trailing underscores
   */
  static normalizeKey(text: string, maxLength: number = 400): string {
    if (!text) return '';

    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with underscore
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_+|_+$/g, '') // Trim underscores from ends
      .substring(0, maxLength); // Cap length
  }
}
