// src/s3.service.ts
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3 } from "aws-sdk";
import APIResponse from "../responses/response";
import { API_RESPONSES } from "@utils/response.messages";
import { APIID } from "@utils/api-id.config";

@Injectable()
export class UploadS3Service {
  private s3: S3;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get("AWS_BUCKET_NAME");
    this.s3 = new S3({
      accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
      secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      region: this.configService.get("AWS_REGION"),
      signatureVersion: "v4",
    });
  }

  async getPresignedUrl(key: string, fileType, response): Promise<string> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: 60 * 5, // URL expires in 5 min
        ContentType: fileType,
      };

      const result = await this.s3.getSignedUrlPromise("putObject", params);
      return await APIResponse.success(
        response,
        APIID.SIGNED_URL,
        result,
        HttpStatus.OK,
        API_RESPONSES.SIGNED_URL_SUCCESS
      );
    } catch (error) {
      return APIResponse.error(
        response,
        APIID.SIGNED_URL,
        API_RESPONSES.BAD_REQUEST,
        API_RESPONSES.SIGNED_URL_FAILED,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
