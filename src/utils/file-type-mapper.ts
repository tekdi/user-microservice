/**
 * FileTypeMapper Utility Class
 *
 * Centralizes MIME type mappings and file type validation logic.
 * Eliminates duplication and provides a single source of truth for file type operations.
 */
export class FileTypeMapper {
  /**
   * Comprehensive mapping of file extensions to MIME types
   */
  private static readonly EXTENSION_TO_MIME: Record<string, string> = {
    // Documents
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    
    // Videos
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg',
    'wma': 'audio/x-ms-wma',
    'flac': 'audio/flac',
    'm4a': 'audio/mp4',
    'opus': 'audio/opus'
  };

  /**
   * Reverse mapping of MIME types to file extensions
   */
  private static readonly MIME_TO_EXTENSION: Record<string, string> = Object.entries(FileTypeMapper.EXTENSION_TO_MIME)
    .reduce((acc, [ext, mime]) => {
      acc[mime] = ext;
      return acc;
    }, {} as Record<string, string>);

  /**
   * List of all supported file extensions
   */
  private static readonly SUPPORTED_EXTENSIONS = Object.keys(FileTypeMapper.EXTENSION_TO_MIME);

  /**
   * List of all supported MIME types
   */
  private static readonly SUPPORTED_MIME_TYPES = Object.values(FileTypeMapper.EXTENSION_TO_MIME);

  /**
   * Check if a file type (extension or MIME type) is supported by the system
   * @param fileType - The file type to check (extension or MIME type)
   * @returns True if the file type is supported
   */
  static isSupportedType(fileType: string): boolean {
    const normalizedType = fileType.toLowerCase();
    return this.SUPPORTED_EXTENSIONS.includes(normalizedType) || 
           this.SUPPORTED_MIME_TYPES.includes(normalizedType);
  }

  /**
   * Check if a file's MIME type or extension matches any of the allowed types
   * @param fileMimeType - The file's MIME type
   * @param fileExtension - The file's extension
   * @param allowedTypes - Array of allowed types (extensions or MIME types)
   * @returns True if the file type is allowed
   */
  static isAllowedType(
    fileMimeType: string, 
    fileExtension: string, 
    allowedTypes: string[]
  ): boolean {
    const normalizedMimeType = fileMimeType.toLowerCase();
    const normalizedExtension = fileExtension.toLowerCase();
    const normalizedAllowedTypes = allowedTypes.map(t => t.toLowerCase());

    return normalizedAllowedTypes.some(allowedType => {
      // Direct match with MIME type or extension
      if (allowedType === normalizedMimeType || allowedType === normalizedExtension) {
        return true;
      }

      // Check if allowed type is an extension and matches the file's MIME type
      if (this.EXTENSION_TO_MIME[allowedType] === normalizedMimeType) {
        return true;
      }

      // Check if allowed type is a MIME type and matches the file's extension
      if (this.MIME_TO_EXTENSION[allowedType] === normalizedExtension) {
        return true;
      }

      return false;
    });
  }

  /**
   * Get MIME type from file extension
   * @param extension - The file extension (with or without dot)
   * @returns The MIME type or undefined if not found
   */
  static getMimeType(extension: string): string | undefined {
    const cleanExtension = extension.replace(/^\./, '').toLowerCase();
    return this.EXTENSION_TO_MIME[cleanExtension];
  }

  /**
   * Get file extension from MIME type
   * @param mimeType - The MIME type
   * @returns The file extension or undefined if not found
   */
  static getExtension(mimeType: string): string | undefined {
    const normalizedMimeType = mimeType.toLowerCase();
    return this.MIME_TO_EXTENSION[normalizedMimeType];
  }

  /**
   * Convert MIME type to simple extension for default file type selection
   * @param mimeType - The MIME type to convert
   * @returns The simple extension or the original MIME type if no mapping found
   */
  static mimeTypeToExtension(mimeType: string): string {
    const extension = this.getExtension(mimeType);
    return extension || mimeType;
  }

  /**
   * Get all supported file extensions
   * @returns Array of supported file extensions
   */
  static getSupportedExtensions(): string[] {
    return [...this.SUPPORTED_EXTENSIONS];
  }

  /**
   * Get all supported MIME types
   * @returns Array of supported MIME types
   */
  static getSupportedMimeTypes(): string[] {
    return [...this.SUPPORTED_MIME_TYPES];
  }

  /**
   * Get descriptive name for a file type (e.g., 'document', 'image', 'video', 'audio')
   * @param fileType - The file type extension
   * @returns Descriptive name for the file type
   */
  static getDescriptiveName(fileType: string): string {
    const normalizedType = fileType.toLowerCase();
    
    // Documents
    if (['pdf', 'docx', 'doc', 'txt'].includes(normalizedType)) {
      return 'document';
    } else if (['xlsx', 'xls', 'csv'].includes(normalizedType)) {
      return 'spreadsheet';
    } else if (['ppt', 'pptx'].includes(normalizedType)) {
      return 'presentation';
    }
    // Images
    else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(normalizedType)) {
      return 'image';
    }
    // Videos
    else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp'].includes(normalizedType)) {
      return 'video';
    }
    // Audio
    else if (['mp3', 'wav', 'aac', 'ogg', 'wma', 'flac', 'm4a', 'opus'].includes(normalizedType)) {
      return 'audio';
    }
    
    return 'file';
  }

  /**
   * Validate if a file type is allowed based on field parameters
   * @param fileMimeType - The file's MIME type
   * @param fileExtension - The file's extension
   * @param allowedTypes - Array of allowed types from field parameters
   * @returns True if the file type is allowed
   */
  static validateFileType(
    fileMimeType: string,
    fileExtension: string,
    allowedTypes: string[]
  ): boolean {
    if (!allowedTypes || allowedTypes.length === 0) {
      return true; // No restrictions
    }

    return this.isAllowedType(fileMimeType, fileExtension, allowedTypes);
  }
} 