import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { Readable } from "stream";
import { StorageAdapter, StorageMetadata, UploadResult } from "./storage.interface";

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          sha256,
        },
      }),
    );

    return {
      key,
      size: buffer.length,
      sha256,
    };
  }

  async downloadStream(key: string): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!res.Body) {
      throw new Error(`S3 object body is empty: ${key}`);
    }

    return res.Body as Readable;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const stream = await this.downloadStream(key);
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        size: res.ContentLength ?? 0,
        mimeType: res.ContentType ?? "application/octet-stream",
        sha256: res.Metadata?.["sha256"],
        lastModified: res.LastModified,
      };
    } catch {
      return null;
    }
  }
}
