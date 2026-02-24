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

    let normalized = str
      .toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '_')
      .replaceAll(/_{2,}/g, '_');

    // Safe, non-regex approach for trimming to guarantee linear runtime
    while (normalized.startsWith('_')) {
      normalized = normalized.slice(1);
    }
    while (normalized.endsWith('_')) {
      normalized = normalized.slice(0, -1);
    }

    // Truncate
    if (normalized.length > maxLength) {
      normalized = normalized.substring(0, maxLength);
      // Re-trim after truncation
      while (normalized.endsWith('_')) {
        normalized = normalized.slice(0, -1);
      }
    }

    return normalized;
  }
}
