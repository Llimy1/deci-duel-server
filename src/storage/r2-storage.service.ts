import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly accountId = process.env.R2_ACCOUNT_ID;
  private readonly bucketName = process.env.R2_BUCKET_NAME;
  private readonly accessKeyId = process.env.R2_ACCESS_KEY_ID;
  private readonly secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  private readonly endpoint = process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined;

  private client: S3Client | null = null;

  async uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.getClient();

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.getClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName!,
        Key: key,
      }),
    );
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 60 * 60): Promise<string> {
    const client = this.getClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucketName!, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  private getClient(): S3Client {
    this.ensureConfigured();

    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: this.endpoint,
        credentials: {
          accessKeyId: this.accessKeyId!,
          secretAccessKey: this.secretAccessKey!,
        },
      });
    }

    return this.client;
  }

  private ensureConfigured() {
    if (!this.accountId || !this.bucketName || !this.accessKeyId || !this.secretAccessKey) {
      throw new InternalServerErrorException('R2 환경변수가 설정되지 않았습니다.');
    }
  }
}
