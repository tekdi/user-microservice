import { StorageConfig } from '../storage/types/storage.types';

/**
 * Validates S3 configuration when S3 provider is selected.
 * Ensures all required AWS environment variables are present and non-empty.
 * @throws Error if S3 is selected but required variables are missing
 */
function validateS3Config(): void {
  const requiredVars = [
    { name: 'AWS_REGION', value: process.env.AWS_REGION },
    { name: 'AWS_BUCKET', value: process.env.AWS_BUCKET },
    { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID },
    { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY },
  ];

  const missingVars = requiredVars.filter(v => !v.value || v.value.trim() === '');

  if (missingVars.length > 0) {
    const missingVarNames = missingVars.map(v => v.name).join(', ');
    throw new Error(
      `S3 storage provider is selected but required environment variables are missing or empty: ${missingVarNames}. ` +
      `Please set these environment variables or change STORAGE_PROVIDER to 'local'.`
    );
  }
}

// Determine the storage provider
const selectedProvider = (['local', 's3'].includes(process.env.STORAGE_PROVIDER)
  ? process.env.STORAGE_PROVIDER
  : 'local') as 'local' | 's3';

// Validate S3 configuration if S3 provider is selected
if (selectedProvider === 's3') {
  validateS3Config();
  console.log('S3 storage configuration validated successfully');
}

export const storageConfig: StorageConfig = {
  provider: selectedProvider,

  local: {
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },
  s3: {
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_BUCKET!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    minFileSizeBytes: parseInt(process.env.AWS_MIN_FILE_SIZE_BYTES || '1', 10), // Default to 1 byte
  },
};
