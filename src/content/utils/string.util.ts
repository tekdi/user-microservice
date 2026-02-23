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

    // Cap input length immediately to prevent ReDoS on massive strings
    const str = text.substring(0, maxLength + 100);

    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_') // Linear: replaces each non-alphanumeric
      .replace(/_{2,}/g, '_')     // Linear: replaces sequences of 2 or more underscores
      .replace(/^_+/, '')         // Linear: Removes leading underscores
      .replace(/_+$/, '')         // Linear: Removes trailing underscores
      .substring(0, maxLength)    // Final truncate
      .replace(/_+$/, '');        // Remove trailing underscores that may have appeared after truncation
  }
}
