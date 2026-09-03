import "dotenv/config";
import { z } from "zod";

const DEFAULT_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "application/x-bzip2",
  "application/x-7z-compressed",
  "application/json",
  "application/octet-stream",
  "text/plain",
  "text/csv",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
];

// Explicitly forbidden executable extensions
export const DISALLOWED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".com",
  ".msi",
  ".vbs",
  ".ps1",
  ".scr",
  ".pif",
  ".reg",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_SECRET: z.string().min(16, "REFRESH_SECRET must be at least 16 characters"),
  REFRESH_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("storage/uploads"),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(50 * 1024 * 1024), // 50MB
  ALLOWED_MIMES: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").map((s) => s.trim().toLowerCase()) : DEFAULT_ALLOWED_MIMES)),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_ENDPOINT: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment configuration:", result.error.format());
    throw new Error("Invalid environment configuration. Check your .env file.");
  }
  return result.data;
}

export const env = parseEnv();
