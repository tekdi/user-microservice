import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class FilesUploadService {
    private readonly s3Client: S3Client;
    private readonly bucketName: string = process.env.AWS_BUCKET_NAME;

    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    async saveFile(file: Express.Multer.File): Promise<{ filePath: string; fileSize: number }> {

        const allowedExtensions: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.ico', '.webp'];
        const fileExtension = extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            throw new BadRequestException(`File type ${fileExtension} is not allowed.`);
        }

        const uniqueFileName = `${uuidv4()}${fileExtension}`;
        const fileUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

        const params = {
            Bucket: this.bucketName,
            Key: uniqueFileName,
            Body: file.buffer,  // Added the Body with file data
            ContentType: file.mimetype,
        };
        console.log(this.bucketName)
        try {
            await this.s3Client.send(new PutObjectCommand(params));
        } catch (error) {
            throw new InternalServerErrorException(`Failed to upload file to S3. Error: ${error?.message || error}. Bucket Name: ${this.bucketName}`);


        }
        // await this.s3Client.send(new PutObjectCommand(params));
        console.log("hiii")
        const metadata = await this.s3Client.send(new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: uniqueFileName,
        }));

        if (!metadata.ContentLength) {
            throw new InternalServerErrorException('Failed to upload file to S3.');
        }

        return {
            filePath: fileUrl,
            fileSize: file.size,
        };
    }
}
