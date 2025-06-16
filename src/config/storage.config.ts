import { StorageConfig } from '../storage/types/storage.types';

export const storageConfig: StorageConfig = {
  provider: (process.env.STORAGE_PROVIDER as 'local' | 's3') || 'local',
  local: {
    uploadDir: process.env.UPLOAD_DIR || './uploads'
  },
  s3: {
    region: process.env.AWS_REGION || '',
    bucket: process.env.AWS_BUCKET || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
}; 