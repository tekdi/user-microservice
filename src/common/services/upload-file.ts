import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class FilesUploadService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string =
    this.configService.get<string>("AWS_BUCKET_NAME");

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.get<string>("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get<string>(
          "AWS_SECRET_ACCESS_KEY"
        ),
      },
    });
  }

  async saveFile(
    file: Express.Multer.File
  ): Promise<{ filePath: string; fileSize: number }> {
    const allowedExtensions: string[] = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".ico",
      ".webp",
      ".mp4",
      ".mp3",
      ".pdf",
      ".doc",
    ];
    const fileExtension = extname(file.originalname).toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException(`Invalid file type: '${fileExtension}'. Allowed file types are:           ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".ico",
          ".webp",
          ".mp4",
          ".mp3",
          ".pdf",
          ".doc"`);
    }

    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const fileUrl = `https://${
      this.bucketName
    }.s3.${this.configService.get<string>(
      "AWS_REGION"
    )}.amazonaws.com/${uniqueFileName}`;

    const params = {
      Bucket: this.bucketName,
      Key: uniqueFileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params));
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to upload file to S3. Error: ${error?.message || error}`
      );
    }

    const metadata = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: uniqueFileName,
      })
    );

    if (!metadata.ContentLength) {
      throw new InternalServerErrorException("Failed to upload file to S3.");
    }

    return {
      filePath: fileUrl,
      fileSize: file.size,
    };
  }
}
