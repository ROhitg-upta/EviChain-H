import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { Readable } from "stream";
import { StorageAdapter, StorageMetadata, UploadResult } from "./storage.interface";

export class LocalStorageAdapter implements StorageAdapter {
  private readonly rootDir: string;

  constructor(storagePath: string) {
    this.rootDir = path.resolve(process.cwd(), storagePath);
  }

  private resolveSafePath(key: string): string {
    // Sanitize key and prevent directory traversal
    const safeKey = key.replace(/^[/\\]+/, "");
    const targetPath = path.resolve(this.rootDir, safeKey);

    if (!targetPath.startsWith(this.rootDir)) {
      throw new Error("Security violation: Path traversal attempt detected.");
    }

    return targetPath;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const targetPath = this.resolveSafePath(key);
    const parentDir = path.dirname(targetPath);

    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(targetPath, buffer);

    // Compute cryptographic SHA-256
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // Save metadata sidecar for local dev
    const metaPath = `${targetPath}.meta.json`;
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        size: buffer.length,
        mimeType,
        sha256,
        lastModified: new Date().toISOString(),
      }),
    );

    return {
      key,
      size: buffer.length,
      sha256,
    };
  }

  async downloadStream(key: string): Promise<Readable> {
    const targetPath = this.resolveSafePath(key);
    if (!existsSync(targetPath)) {
      throw new Error(`File not found in storage: ${key}`);
    }
    return createReadStream(targetPath);
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(key);
    return fs.readFile(targetPath);
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.resolveSafePath(key);
    const metaPath = `${targetPath}.meta.json`;

    try {
      await fs.unlink(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    try {
      await fs.unlink(metaPath);
    } catch {
      // ignore metadata cleanup error
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const targetPath = this.resolveSafePath(key);
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageMetadata | null> {
    const targetPath = this.resolveSafePath(key);
    try {
      const stats = await fs.stat(targetPath);
      const metaPath = `${targetPath}.meta.json`;

      let mimeType = "application/octet-stream";
      let sha256: string | undefined;

      try {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        const parsed = JSON.parse(metaContent);
        if (parsed.mimeType) mimeType = parsed.mimeType;
        if (parsed.sha256) sha256 = parsed.sha256;
      } catch {
        // fallback if sidecar missing
      }

      return {
        size: stats.size,
        mimeType,
        sha256,
        lastModified: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}
