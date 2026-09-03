import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { prisma } from "./db";

import authRoutes from "./routes/auth.routes";
import evidenceRoutes from "./routes/evidence.routes";
import casesRoutes from "./routes/cases.routes";
import auditRoutes from "./routes/audit.routes";
import publicRoutes from "./routes/public.routes";
import reportsRoutes from "./routes/reports.routes";
import searchRoutes from "./routes/search.routes";
import usersRoutes from "./routes/users.routes";
import notificationsRoutes from "./routes/notifications.routes";
import { securityHeaders, createRateLimiter } from "./middleware";

const app = express();

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many authentication attempts. Please try again in one minute.",
});

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(securityHeaders);
app.use(cookieParser());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// GET /health — Health Check & Database Diagnostic Endpoint
// ═══════════════════════════════════════════════════════════════════
app.get("/health", async (_req: Request, res: Response) => {
  let dbStatus = "connected";
  try {
    // Quick bounded heartbeat query
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database heartbeat timeout")), 4000)),
    ]);
  } catch {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
    }
  }

  const isHealthy = dbStatus === "connected";
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    ok: isHealthy,
    service: "evichain-api",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    database: dbStatus,
    ...(isHealthy ? {} : { message: "Database connection unavailable" }),
  });
});

// ═══════════════════════════════════════════════════════════════════
// Route Manifest
// ═══════════════════════════════════════════════════════════════════
app.use("/auth",          authLimiter, authRoutes);
app.use("/evidence",      evidenceRoutes);
app.use("/cases",         casesRoutes);
app.use("/audit",         auditRoutes);
app.use("/public",        publicRoutes);
app.use("/reports",       reportsRoutes);
app.use("/search",        searchRoutes);
app.use("/users",         usersRoutes);
app.use("/notifications", notificationsRoutes);

// Structured 404 fallback for unmatched API routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "API route not found",
      status: 404,
    },
  });
});

// Centralized structured error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[EviChain Server] Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message,
      status: 500,
    },
  });
});

const port = Number(process.env.PORT) || 4000;

let server: import("http").Server | undefined;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(port, () => {
    console.log("==================================================");
    console.log("EviChain API Booted Successfully");
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Port: ${port}`);
    console.log(`Health Check: http://localhost:${port}/health`);
    console.log("Routes: /auth, /cases, /evidence, /audit, /public, /reports, /search, /users, /notifications");
    console.log("==================================================");
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[EviChain Server] Received ${signal}. Shutting down gracefully...`);
    if (server) {
      server.close(async () => {
        try {
          await prisma.$disconnect();
          console.log("[EviChain Server] Database disconnected. Process exit clean.");
          process.exit(0);
        } catch (err) {
          console.error("[EviChain Server] Error during database disconnection:", err);
          process.exit(1);
        }
      });
    } else {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export { app, server };
