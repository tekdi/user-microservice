// src/s3.service.ts
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3 } from "aws-sdk";
import { S3Client } from "@aws-sdk/client-s3";
import APIResponse from "../responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";
import { v4 as uuidv4 } from "uuid";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

@Injectable()
export class UploadS3Service {
  private s3: S3;
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get("AWS_BUCKET_NAME");
    // this.s3 = new S3({
    //   accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
    //   secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
    //   region: this.configService.get("AWS_REGION"),
    //   signatureVersion: "v4",
    // });
    this.s3Client = new S3Client({
      region: this.configService.get("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      },
    });
  }

  // Upload content using PUT request
  // async getPresignedUrl(key: string, fileType, response): Promise<string> {
  //   try {
  //     const params = {
  //       Bucket: this.bucketName,
  //       Key: key,
  //       Expires: 60 * 5, // URL expires in 5 min
  //       ContentType: fileType,
  //     };

  //     const result = await this.s3.getSignedUrlPromise("putObject", params);
  //     return await APIResponse.success(
  //       response,
  //       APIID.SIGNED_URL,
  //       result,
  //       HttpStatus.OK,
  //       API_RESPONSES.SIGNED_URL_SUCCESS
  //     );
  //   } catch (error) {
  //     return APIResponse.error(
  //       response,
  //       APIID.SIGNED_URL,
  //       API_RESPONSES.BAD_REQUEST,
  //       API_RESPONSES.SIGNED_URL_FAILED,
  //       HttpStatus.BAD_REQUEST
  //     );
  //   }
  // }

  async getPresignedUrl(
    filename: string,
    fileType: string,
    response,
    foldername?: string
  ): Promise<string> {
    try {
      // Dynamic MIME type detection based on file extension
      const getMimeType = (extension: string): string => {
        const mimeTypes: { [key: string]: string } = {
          // Images
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".bmp": "image/bmp",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
          ".tiff": "image/tiff",
          ".ico": "image/x-icon",

          // Documents
          ".pdf": "application/pdf",
          ".doc": "application/msword",
          ".docx":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".xls": "application/vnd.ms-excel",
          ".xlsx":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ".ppt": "application/vnd.ms-powerpoint",
          ".pptx":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ".rtf": "application/rtf",

          // Text files
          ".txt": "text/plain",
          ".csv": "text/csv",
          ".xml": "text/xml",
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".json": "application/json",

          // Videos
          ".mp4": "video/mp4",
          ".avi": "video/x-msvideo",
          ".mov": "video/quicktime",
          ".wmv": "video/x-ms-wmv",
          ".flv": "video/x-flv",
          ".webm": "video/webm",
          ".mkv": "video/x-matroska",

          // Audio
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".m4a": "audio/mp4",
          ".flac": "audio/flac",

          // Archives
          ".zip": "application/zip",
          ".rar": "application/vnd.rar",
          ".7z": "application/x-7z-compressed",
          ".tar": "application/x-tar",
          ".gz": "application/gzip",

          // Other common formats
          ".apk": "application/vnd.android.package-archive",
          ".exe": "application/octet-stream",
          ".dmg": "application/octet-stream",
          ".iso": "application/octet-stream",
        };

        return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
      };

      // Get MIME type dynamically
      const contentType = getMimeType(fileType);

      // Construct unique file key
      const extension = fileType;
      const folderPath = foldername ? `${foldername}/` : "";
      const newKey = `${folderPath}${filename}-${uuidv4()}${extension}`;

      // Create presigned POST with minimal restrictions
      const result = await createPresignedPost(this.s3Client, {
        Bucket: this.bucketName,
        Key: newKey,
        Conditions: [
          // Only enforce the key to prevent tampering
          ["eq", "$key", newKey],
          // Allow any content type
          ["starts-with", "$Content-Type", ""],
          // No file size limit (remove content-length-range)
        ] as any[],
        Fields: {
          key: newKey,
          "Content-Type": contentType,
        },
        Expires: 24 * 60 * 60, // 24 hours instead of 5 minutes
      });

      return APIResponse.success(
        response,
        APIID.SIGNED_URL,
        result,
        HttpStatus.OK,
        API_RESPONSES.SIGNED_URL_SUCCESS
      );
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }
}
