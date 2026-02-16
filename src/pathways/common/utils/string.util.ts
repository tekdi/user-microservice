/**
 * Utility class for string manipulations within the pathways module
 */
export class StringUtil {
    /**
     * Normalizes a string to be used as a key or alias.
     * - Converts to lowercase
     * - Replaces non-alphanumeric characters (except - and _) with underscores
     * - Replaces hyphens with underscores
     * - Collapses multiple underscores into one
     * - Trims leading and trailing underscores (safe, non-regex approach)
     * 
     * @param str The string to normalize
     * @returns The normalized string
     */
    static normalizeKey(str: string): string {
        if (!str) return '';

        let normalized = str
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/-/g, '_')
            .replace(/_{2,}/g, '_');

        // Remove leading underscores (safe, non-backtracking approach)
        while (normalized.startsWith('_')) {
            normalized = normalized.slice(1);
        }

        // Remove trailing underscores (safe, non-backtracking approach)
        while (normalized.endsWith('_')) {
            normalized = normalized.slice(0, -1);
        }

        return normalized;
    }
}
