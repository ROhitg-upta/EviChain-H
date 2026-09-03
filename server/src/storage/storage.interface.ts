import { Readable } from "stream";

export interface StorageMetadata {
  size: number;
  mimeType: string;
  sha256?: string;
  lastModified?: Date;
}

export interface UploadResult {
  key: string;
  size: number;
  sha256: string;
}

export interface StorageAdapter {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult>;
  downloadStream(key: string): Promise<Readable>;
  downloadBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StorageMetadata | null>;
}
