import path from "path";
import { randomUUID } from "crypto";
import { env, DISALLOWED_EXTENSIONS } from "../config/env";
import { StorageAdapter } from "./storage.interface";
import { LocalStorageAdapter } from "./local.adapter";
import { S3StorageAdapter } from "./s3.adapter";

let storageInstance: StorageAdapter | null = null;

/**
 * Storage adapter factory providing singleton adapter based on runtime configuration
 */
export function getStorageAdapter(): StorageAdapter {
  if (storageInstance) return storageInstance;

  if (env.STORAGE_DRIVER === "s3" && env.AWS_S3_BUCKET) {
    storageInstance = new S3StorageAdapter({
      bucket: env.AWS_S3_BUCKET,
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      endpoint: env.AWS_ENDPOINT,
    });
  } else {
    storageInstance = new LocalStorageAdapter(env.STORAGE_LOCAL_PATH);
  }

  return storageInstance;
}

export interface FileValidationOptions {
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedExtension: string;
}

/**
 * Validates uploaded files against security policies:
 * - Max file size
 * - MIME allowlist
 * - Disallowed executable extensions
 * - Sanitized extension check
 */
export function validateEvidenceFile(file: FileValidationOptions): FileValidationResult {
  // 1. File size check
  if (file.sizeBytes <= 0) {
    return { valid: false, error: "File is empty (0 bytes).", sanitizedExtension: "" };
  }

  if (file.sizeBytes > env.MAX_FILE_SIZE_BYTES) {
    const maxMb = Math.round(env.MAX_FILE_SIZE_BYTES / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds the maximum permitted limit of ${maxMb}MB.`,
      sanitizedExtension: "",
    };
  }

  // 2. MIME allowlist check
  const normalizedMime = file.mimeType.toLowerCase().trim();
  if (!env.ALLOWED_MIMES.includes(normalizedMime)) {
    return {
      valid: false,
      error: `File MIME type '${file.mimeType}' is not permitted in evidence registry.`,
      sanitizedExtension: "",
    };
  }

  // 3. Extension safety check
  const rawExt = path.extname(file.name).toLowerCase();
  if (DISALLOWED_EXTENSIONS.has(rawExt)) {
    return {
      valid: false,
      error: `Executable and script file extension '${rawExt}' is forbidden.`,
      sanitizedExtension: "",
    };
  }

  // Sanitize extension to safe alphanumeric characters
  const sanitizedExtension = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 10);

  return {
    valid: true,
    sanitizedExtension: sanitizedExtension ? `.${sanitizedExtension}` : "",
  };
}

/**
 * Generates an unguessable, collision-free storage key.
 * Never uses raw client-supplied paths to prevent directory traversal.
 */
export function generateSafeStorageKey(originalName: string, prefix = "evidence"): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const uuid = randomUUID();

  return `${prefix}/${yearMonth}/${uuid}${ext}`;
}

/**
 * Cleanup helper for failed uploads / rollback operations
 */
export async function cleanupStorageKey(key: string): Promise<void> {
  if (!key) return;
  try {
    const storage = getStorageAdapter();
    await storage.delete(key);
  } catch (err) {
    console.error(`Failed to cleanup orphaned storage key ${key}:`, err);
  }
}
