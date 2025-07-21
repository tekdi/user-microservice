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
    foldername?: string,
  ): Promise<string> {
    try {
      const allowedFileTypes = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp", // Images
        ".pdf",
        ".doc",
        ".docx", // Documents
        ".mp4",
        ".mov", // Videos
        ".txt",
        ".csv", // Text files
      ];

      const mimeTypeMap = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".txt": "text/plain",
        ".csv": "text/csv",
      };

      // Validate file extension
      if (!allowedFileTypes.includes(fileType)) {
        return APIResponse.error(
          response,
          APIID.SIGNED_URL,
          API_RESPONSES.BAD_REQUEST,
          API_RESPONSES.INVALID_FILE_TYPE,
          HttpStatus.BAD_REQUEST,
        );
      }

      const contentType = mimeTypeMap[fileType];

      // Construct unique file key
      // const newKey = `${filename}-${uuidv4()}${fileType}`;
      const extension = fileType;
      const folderPath = foldername ? `${foldername}/` : "";
      const newKey = `${folderPath}${filename}-${uuidv4()}${extension}`;

      const result = await createPresignedPost(this.s3Client, {
        Bucket: this.bucketName,
        Key: newKey,
        Conditions: [
          ["starts-with", "$Content-Type", "image/"],
          ["eq", "$Content-Type", contentType], // ✅ this enforces exact match
          ["eq", "$key", newKey], // ✅ makes sure they don't change key
          ["content-length-range", 0, 5 * 1024 * 1024], // max 5MB
        ] as any[],
        Fields: {
          key: newKey,
          "Content-Type": contentType,
        },
        Expires: 300, // 5 minutes
      });

      return APIResponse.success(
        response,
        APIID.SIGNED_URL,
        result,
        HttpStatus.OK,
        API_RESPONSES.SIGNED_URL_SUCCESS,
      );
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }
}
