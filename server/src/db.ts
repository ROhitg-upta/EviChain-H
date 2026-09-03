import { PrismaClient, Prisma } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prismaClient ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient = prisma;
}

/**
 * Explicit connection lifecycle handler
 */
export async function connectDb(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("Database connection established.");
  } catch (err) {
    console.error("Failed to connect to database:", err);
    throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("Database connection closed cleanly.");
  } catch (err) {
    console.error("Error disconnecting database:", err);
  }
}

/**
 * Normalized database error structure
 */
export interface NormalizedDbError {
  statusCode: number;
  message: string;
  code?: string;
  field?: string;
}

/**
 * Normalizes Prisma-specific exceptions into safe, user-friendly HTTP errors.
 * Never exposes raw SQL queries or sensitive internal table schemas.
 */
export function normalizePrismaError(error: unknown): NormalizedDbError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const target = (error.meta?.target as string[])?.join(", ") || "field";
        return {
          statusCode: 409,
          code: "CONFLICT",
          message: `A record with this ${target} already exists.`,
          field: target,
        };
      }
      case "P2025":
        return {
          statusCode: 404,
          code: "NOT_FOUND",
          message: "The requested record was not found or has been removed.",
        };
      case "P2003":
        return {
          statusCode: 400,
          code: "FOREIGN_KEY_VIOLATION",
          message: "The operation failed due to a related record dependency constraint.",
        };
      case "P2024":
        return {
          statusCode: 503,
          code: "TIMED_OUT",
          message: "Database operation timed out. Please try again shortly.",
        };
      default:
        return {
          statusCode: 400,
          code: error.code,
          message: "Database request could not be completed.",
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid database operation payload.",
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected database error occurred.",
  };
}