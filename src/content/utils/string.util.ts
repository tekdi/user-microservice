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
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/(^_+)|(_+$)/g, '')
      .substring(0, maxLength);   // Final truncate
  }
}
